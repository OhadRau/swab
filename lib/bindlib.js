export function __js_new_big_int(upper, lower) {
  return (BigInt(upper) * (2n ** 32n)) + BigInt(lower)
}

let __wasm_wrapped_functions = {}

export function __wasm_wrap_function(fn, wrapper_id) {
  /* wrapper_id refers to the entry in the table of WASM
   * functions wrappers for this type. e.g. an i32->i32
   * function just gets dumped into the table and (using
   * memoization) we can reuse that same function for all
   * compatible callbacks. This means less compilation of
   * WASM functions.
   */
  const wrapper = __wasm_wrapped_functions[wrapper_id]
  // TODO: Is there a better way than this?
  let instance = new WebAssembly.Instance(wrapper, {
    e: { f: fn }
  })
  return instance.exports.f
}
