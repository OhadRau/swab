import * as fs from 'fs'

import { c2js, js2c, getConstructor, substitute, CType } from './types'
import { wrapI64Fn } from './gen_c'
import { createEnv, gensym } from './env'

type Config = {
  wasmBinary: string,
  cOutput: string,
  jsOutput: string,
  importSymbols: string,
  exportSymbols: string,

  extraExports: string[],
  extraImports: string[],

  includes: string[],
  includesRelative: string[]
  types: any,
  functions: { [name: string]: { takes: CType[], returns: CType } }
}

function getCType(input: any): CType {
  if (typeof input === 'string') {
    return {
      kind: 'user',
      name: input
    }
  } else if (typeof input === 'object') {
    switch (input.kind) {
      case 'bool':
        return { kind: 'bool' }
      case 'char':
        return { kind: 'char' }
      case 'u8':
        return { kind: 'u8' }
      case 'i8':
        return { kind: 'i8' }
      case 'u16':
        return { kind: 'u16' }
      case 'i16':
        return { kind: 'i16' }
      case 'u32':
        return { kind: 'u32' }
      case 'i32':
        return { kind: 'i32' }
      case 'u64':
        return { kind: 'u64' }
      case 'i64':
        return { kind: 'i64' }
      case 'f32':
        return { kind: 'f32' }
      case 'f64':
        return { kind: 'f64' }
      case 'pointer':
        if (input.to) {
          return { kind: 'pointer', to: getCType(input.to) }
        }
        break
      case 'array':
        if (input.of && input.length) {
          return { kind: 'array', of: getCType(input.of), length: input.length }
        }
        break
      case 'functionPointer':
        if (input.takes && input.returns) {
          return { kind: 'functionPointer', takes: input.takes.map(getCType), returns: getCType(input.returns) }
        }
        break
      case 'enum':
        if (input.values) {
          return { kind: 'enum', values: input.values } 
        }
        break
      case 'struct':
      case 'union':
        if (input.fields) {
          let fields: { [key: string]: CType } = {}
          for (let field in input.fields) {
            fields[field] = getCType(input.fields[field])
          }
          return { kind: input.kind, fields }
        }
        break
      case 'void':
        return { kind: 'void' }
      case 'user':
        if (input.name) {
          return { kind: 'user', name: input.name }
        }
        break
      default:
        return { kind: 'user', name: input.kind }
    }
  }
  throw `Malformed type '${input}' in config file`
}

function genBindings(config: Config, wasmFile: string) {
  let env = createEnv(wasmFile)

  // Add extra exports/imports to the env
  for (let extraExport of config.extraExports) {
    env.exports.add(extraExport)
  }

  for (let extraImport of config.extraImports) {
    env.imports.add(extraImport)
  }

  // Add user-defined types to substitution table
  for (let typeName in config.types) {
    env.substitutions[typeName] = getCType(config.types[typeName])
  }

  // Add extra #include's into cBuffer
  for (let include of config.includes) {
    env.cBuffer += `#include <${include}>\n`
  }

  for (let include of config.includesRelative) {
    env.cBuffer += `#include "${include}"\n`
  }

  // Generate constructors (& in turn generate accessors/destructors thru c2js)
  for (let typeName in env.substitutions) {
    // Skip non-union/non-struct types
    let typeInfo = env.substitutions[typeName]
    typeInfo.orig = { kind: 'user', name: typeName }
    let ptrTypeInfo: CType = { kind: 'pointer', to: typeInfo }
    ptrTypeInfo.orig = { kind: 'pointer', to: typeInfo.orig }

    if (typeInfo.kind !== 'union' && typeInfo.kind !== 'struct') {
      continue
    }

    const constructor = getConstructor(env, typeInfo)
    const ptrConstructor = getConstructor(env, ptrTypeInfo)

    // Take only the last portion of the type (e.g. struct x => x)
    const typeSegments = typeName.split(/\s+/g)
    let actualName = typeSegments[typeSegments.length - 1]

    let checkField = ''
    const fields = []
    const fieldValues = []
    for (let field in typeInfo.fields) {
      checkField += `${field} ? ${fields.length} : `
      fields.push(field)
      fieldValues.push(`${field}: ${js2c(env, typeInfo.fields[field])}(${field})`)
    }

    checkField += '-1'

    // If it's a union, we want to use it as a discriminated union (i.e. get index of field to set)
    if (typeInfo.kind === 'union') {
      let convert = c2js(env, typeInfo), convertPtr = c2js(env, ptrTypeInfo)
      env.jsBuffer += `
export function create_${actualName}({${fields.join(',')}}) {
  return ${convert}(${checkField}, swab.__wasm_exports.${constructor}({${fieldValues.join(',')}}));
}

export function create_${actualName}_ptr() {
  return ${convertPtr}(swab.__wasm_exports.${ptrConstructor}());
}
`
    } else if (typeInfo.kind === 'struct') {
      let convert = c2js(env, typeInfo), convertPtr = c2js(env, ptrTypeInfo)
      env.jsBuffer += `
export function create_${actualName}({${fields.join(',')}}) {
  return ${convert}(swab.__wasm_exports.${constructor}({${fieldValues.join(',')}}));
}

export function create_${actualName}_ptr() {
  return ${convertPtr}(swab.__wasm_exports.${ptrConstructor}());
}
`
    }
    env.exports.add(constructor)
    env.exports.add(ptrConstructor)
  }

  // Generate wrappers for user-exported functions
  for (let functionName in config.functions) {
    let wrapperName = functionName
    const fn = config.functions[functionName]
    const result = substitute(env, getCType(fn.returns))
    const params = fn.takes.map(t => substitute(env, getCType(t)))
    const isI64 = (t: CType) => t.kind === 'i64' || t.kind === 'u64'
    if (isI64(result) || params.some(isI64)) {
      wrapperName = wrapI64Fn(env, functionName, params, result)
    }

    const paramNames = params.map(_ => gensym('param'))
    const args = paramNames.map((param, index) => `${js2c(env, params[index])}(${param})`)

    const wrapReturn = c2js(env, result)

    env.jsBuffer += `
export function ${functionName}(${paramNames.join(',')}) {
  return ${wrapReturn}(
    swab.__wasm_exports.${wrapperName}(
      ${args.join(',')}
    )
  )
}
`
    env.exports.add(functionName)
  }

  return env
}

export function bind(config: Config) {
  const env = genBindings(config, config.wasmBinary)
  fs.writeFileSync(config.cOutput, env.cBuffer)
  fs.writeFileSync(config.jsOutput, env.jsBuffer)
  fs.writeFileSync(config.importSymbols, Array.from(env.imports).join('\n'))
  fs.writeFileSync(config.exportSymbols, Array.from(env.exports).join('\n'))
}

let configFile = process.argv[process.argv.length - 1]
let config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
bind(config)
