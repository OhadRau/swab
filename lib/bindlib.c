#include "bindlib.h"

// IMPORTME
__wasm_big_int __js_new_big_int(i32 upper, i32 lower);
i32            __js_big_int_upper(__wasm_big_int num);
i32            __js_big_int_lower(__wasm_big_int num);

__wasm_big_int __wasm_wrap_i64(i64 i64) {
  i32 upper = (i32) (i64 >> 32);
  i32 lower = (i32) i64;
  return __js_new_big_int(upper, lower);
}

i64 __wasm_unwrap_i64(__wasm_big_int big_int) {
  i64 result = __js_big_int_upper(big_int) << 32 | __js_big_int_lower(big_int);
}
