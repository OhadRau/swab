export function createEnv(wasmFile) {
  return {
    wasmFile,
    wrapperCache: {},
    accessorTable: {},
    sizeofTable: {},
    i64Table: {},
    c2jsTable: {},
    substitutions: {
      'int8_t': { type: 'i8', params: [] },
      'uint8_t': { type: 'u8', params: [] },

      'short': { type: 'i16', params: [] },
      'int16_t': { type: 'i16', params: [] },
      'unsigned short': { type: 'u16', params: [] },
      'uint16_t': { type: 'u16', params: [] },

      'int': { type: 'i32', params: [] },
      'int32_t': { type: 'i32', params: [] },
      'unsigned int': { type: 'u32', params: [] },
      'uint32_t': { type: 'u32', params: [] },
      'size_t': { type: 'u32', params: [] },

      'long': { type: 'i64', params: [] },
      'int64_t': { type: 'i64', params: [] },
      'unsigned long': { type: 'u64', params: [] },
      'uint64_t': { type: 'u64', params: [] },

      'float': { type: 'f32', params: [] },
      'double': { type: 'f64', params: [] },

      '__wasm_big_int': { type: 'pointer', params: [ { type: 'void' } ] }
    },
    // TODO: Handle escape codes in wasmFile name
    // TODO: Generate everything within a callback/async method
    jsBuffer: `
import 'wasm-bindlib'

__wasm_load('${wasmFile}')

function __wasm_identity(__x) {
  return __x;
}
`,
    cBuffer: `
#include "bindlib.h"
#include <stdint.h>
#include <stdlib.h>
`,
    imports: new Set([]),
    exports: new Set([])
  }
}

let uniq = 0
export function gensym(name = 'uniq') {
  return `__${name}${uniq++}`
}
