#ifndef BINDLIB_H
#define BINDLIB_H

#include <stdint.h>

#define BINDLIB_VERSION "0.0.0"

typedef void * __wasm_big_int;

__wasm_big_int __wasm_wrap_i64(int64_t i64);

#endif
