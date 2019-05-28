#ifndef BINDLIB_H
#define BINDLIB_H

#include <stdint.h>

#define BINDLIB_VERSION "0.0.0"

typedef uint8_t u8;
typedef  int8_t i8;

typedef uint16_t u16;
typedef  int16_t i16;

typedef uint32_t u32;
typedef  int32_t i32;

typedef uint64_t u64;
typedef  int64_t i64;

typedef  float f32;
typedef double f64;

typedef void * __wasm_big_int;

__wasm_big_int __wasm_wrap_i64(int64_t i64);

#endif
