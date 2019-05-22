import * as fs from 'fs'

import { c2js } from './types.js'
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

    const params = fn.parameters.map(_ => gensym())
    const args = params.map((param, index) => `${c2js(env, fn.parameters[index])}(${param})`)

    let wrapReturn = c2js(env, fn.returnType)

    env.jsBuffer += `
function ${functionName}(${params.join(',')}) {
  return ${wrapReturn}(
    ${functionName}(
      ${args.join(',')}
    )
  )
}
`
  }

  return env
}

const env = genBindings('./test/basic-config.json', 'library.wasm')
console.log(env.jsBuffer)
console.log('========================================================')
console.log(env.cBuffer)

/*
let env = createEnv('test.wasm')

let struct_ptr_type = {
  type: 'pointer',
  params: [
    { type: 'struct',
      params: {
	'a': { type: 'u32', params: [] },
	'b': { type: 'pointer', params: [ { type: 'char', params: [] } ] }
      }
    }
  ]
}

console.log("Generating convertor for:")
console.log("\t" + type2ctype(struct_ptr_type))
console.log(c2js(env, struct_ptr_type))

let my_c_type = {
  type: 'functionPointer',
  params: [
    [
      { type: 'u64', params: [] },
      { type: 'pointer', params: [ { type: 'i32', params: [] } ] },
      { type: 'pointer', params: [ { type: 'char', params: [] } ] },
      { type: 'array', params: [ { type: 'i32', params: [] }, 3] }
    ],
    { type: 'void', params: [] }
  ]
}

console.log("Generating convertor for:")
console.log("\t" + type2ctype(my_c_type))
console.log(c2js(env, my_c_type))

console.log("Generating sizeof:")
console.log(wrapSizeof(env, my_c_type))

console.log("Generating i64:")
console.log(wrapI64Fn(env, 'f', [{type:'i64', params: []}], my_c_type))

let my_stupid_type = {
  type: 'array',
  params: [
    {
      type: 'functionPointer',
      params: [
        [
          {
            type: 'pointer',
            params: [
              { type: 'array', params: [ { type: 'i32', params: [] }, 3 ] }
            ]
          }
        ],
        {
          type: 'array',
          params: [
            { type: 'i32', params: [] },
            3
          ]
        }
      ]
    },
    3
  ]
}

console.log("Generating concrete declarator:")
console.log("\t" + type2cdecl(my_stupid_type, 'f'))

console.log("Caching wrapper:")
let [wrapperId, wrapperBody] = cacheWrapper(env, [{type: 'i32', params: []}], my_c_type)
console.log("\tWrapper ID: " +  wrapperId)
console.log("\tWrapper Body: " + wrapperBody)

console.log(env.jsBuffer)
console.log(env.cBuffer)
*/
