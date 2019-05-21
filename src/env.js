export function createEnv(wasmFile) {
  return {
    wasmFile,
    wrapperCache: {},
    accessorTable: {},
    sizeofTable: {},
    i64Table: {},
    jsBuffer: `
import 'wasm-bindlib'
Promise.resolve(__wasm_load(${wasmFile}))
`,
    cBuffer: `
#include "bindlib.h"
#include <stdint.h>
#include <stdlib.h>
`
  }
}

let uniq = 0
export function gensym() {
  return `__uniq${uniq++}`
}
