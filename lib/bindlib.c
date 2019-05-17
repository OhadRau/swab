#include "bindlib.h"

// IMPORTME
__js_new_big_int(int32_t upper, int32_t lower);

__wasm_big_int __wasm_wrap_i64(int64_t i64) {
  int32_t upper = (int32_t) (i64 >> 32);
  int32_t lower = (int32_t) i64;
  return __js_new_big_int(upper, lower);
}
