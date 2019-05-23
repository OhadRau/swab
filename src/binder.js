import * as fs from 'fs'

import { c2js, js2c } from './types.js'
import { type2ctype, type2cdecl, wrapAccessors, wrapSizeof, wrapI64Fn } from './gen_c.js'
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

  for (let functionName in config.functions) {
    let fn = config.functions[functionName]
    const isI64 = t => t.type === 'i64' || t.type === 'u64'
    if (isI64(fn.returnType) || fn.parameters.some(isI64)) {
      functionName = wrapI64Fn(env, functionName, fn.parameters, fn.returnType)
    }

    const params = fn.parameters.map(_ => gensym('param'))
    const args = params.map((param, index) => `${js2c(env, fn.parameters[index])}(${param})`)

    let wrapReturn = c2js(env, fn.returnType)

    env.jsBuffer += `
function ${functionName}(${params.join(',')}) {
  return ${wrapReturn}(
    __wasm_exports.${functionName}(
      ${args.join(',')}
    )
  )
}
`
  }

  return env
}

//const env = genBindings('./test/basic-config.json', 'library.wasm')
const env = genBindings('./test/libsass-config.json', 'library.wasm')
console.log(env.jsBuffer)
console.log('========================================================')
console.log(env.cBuffer)
