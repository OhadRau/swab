import * as fs from 'fs'

import { c2js, js2c, getConstructor, substitute } from './types.js'
import { type2ctype, type2cdecl, wrapI64Fn } from './gen_c.js'
import { cacheWrapper } from './callback.js'
import { createEnv, gensym } from './env.js'

function genBindings(configFile, wasmFile) {
  let config = JSON.parse(fs.readFileSync(configFile, 'utf8'))

  let env = createEnv(wasmFile)

  // Add user-defined types to substitution table
  for (let type in config.types) {
    env.substitutions[type] = config.types[type]
  }

  // Add extra #include's into cBuffer
  for (let include of config.includes) {
    env.cBuffer += `#include <${include}>\n`
  }

  for (let include of config.includesRelative) {
    env.cBuffer += `#include "${include}"\n`
  }

  // Generate constructors (& in turn generate accessors/destructors thru c2js)
  for (let type in config.types) {
    // Skip non-union/non-struct types
    let typeInfo = config.types[type]
    typeInfo.orig = { type }
    let ptrTypeInfo = { type: 'pointer', params: [ typeInfo ] }
    ptrTypeInfo.orig = { type: 'pointer', params: [ typeInfo.orig ] }

    if (typeInfo.type !== 'union' && typeInfo.type !== 'struct') {
      continue
    }

    const constructor = getConstructor(env, typeInfo)
    const ptrConstructor = getConstructor(env, ptrTypeInfo)

    // Take only the last portion of the type (e.g. struct x => x)
    const typeSegments = type.split(/\s+/g)
    let typeName = typeSegments[typeSegments.length - 1]

    const checkField = ''
    const fields = []
    const fieldValues = []
    for (let field in typeInfo.params) {
      checkField += `${field} ? ${fields.length} : `
      fields.push(field)
      fieldValues.push(`${field}: ${js2c(env, typeInfo.params[field])}(${field})`)
    }

    checkField += '-1'

    // If it's a union, we want to use it as a discriminated union (i.e. get index of field to set)
    if (typeInfo.type === 'union') {
      let convert = c2js(env, typeInfo), convertPtr = c2js(env, ptrTypeInfo)
      env.jsBuffer += `
export function create_${typeName}({${fields.join(',')}}) {
  return ${convert}(${checkField}, swab.__wasm_exports.${constructor}({${fieldValues.join(',')}}));
}

export function create_${typeName}_ptr() {
  return ${convertPtr}(swab.__wasm_exports.${ptrConstructor}());
}
`
    } else if (typeInfo.type === 'struct') {
      let convert = c2js(env, typeInfo), convertPtr = c2js(env, ptrTypeInfo)
      env.jsBuffer += `
export function create_${typeName}({${fields.join(',')}}) {
  return ${convert}(swab.__wasm_exports.${constructor}({${fieldValues.join(',')}}));
}

export function create_${typeName}_ptr() {
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
    const result = substitute(env, fn.returnType)
    const params = fn.parameters.map(t => substitute(env, t))
    const isI64 = t => t.type === 'i64' || t.type === 'u64'
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

export function bind({configFile, wasmBinary, cOutput, jsOutput, importSyms, exportSyms}) {
  const env = genBindings(configFile, wasmBinary)
  fs.writeFileSync(cOutput, env.cBuffer)
  fs.writeFileSync(jsOutput, env.jsBuffer)
  fs.writeFileSync(importSyms, Array.from(env.imports).join('\n'))
  fs.writeFileSync(exportSyms, Array.from(env.exports).join('\n'))
}

bind({
  configFile: './test/basic-config.json',
  wasmBinary: 'basic-bindings.wasm',
  cOutput: './test/build/basic-bindings.c',
  jsOutput: './test/build/basic-bindings.mjs',
  importSyms: './test/build/import.syms',
  exportSyms: './test/build/export.syms'
})

/*
const env = genBindings('./test/basic-config.json', 'library.wasm')
//const env = genBindings('./test/libsass-config.json', 'library.wasm')
console.log(env.jsBuffer)
console.log('========================================================')
console.log(env.cBuffer)
console.log('========================================================')
console.log(`Imports: [${[...env.imports.values()].join(', ')}]`)
console.log(`Exports: [${[...env.exports.values()].join(', ')}]`)
*/
