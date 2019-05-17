export function createEnv() {
  return {
    sizeof: sizeof,
    memoryname: '__wasm_memory',
    tablename: "__wasm_table",
    tablebasename: "__wasm_table_base",
    wrapfnname: "__wasm_wrap_function",
    wrapI64Name: "__wasm_wrap_i64",
    bigIntType: { type: "__wasm_big_int", params: [] },
    callbackTableName: "__wasm_wrapper_table",
    wrapperCache: {},
    sizeofTable: {},
    i64Table: {}
  }
}

let uniq = 0
export function gensym() {
  return `__uniq${uniq++}`
}

function sizeof() {
  return 1; // TODO: Decide how to actually do this properly
}
