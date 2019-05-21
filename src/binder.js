import { c2js } from './types.js'
import { type2ctype, type2cdecl, wrapAccessors, wrapSizeof, wrapI64Fn } from './gen_c.js'
import { cacheWrapper } from './callback.js'
import { createEnv } from './env.js'

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
console.log(wrapI64Fn(env, 'f', [{type:'i64', params: []}], my_c_type));

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
