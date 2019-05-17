export function __js_new_big_int(upper, lower) {
  return (BigInt(upper) * (2n ** 32n)) + BigInt(lower);
}

export function __wasm_wrap_function(fn) {
  // There's a better way to do this
}
