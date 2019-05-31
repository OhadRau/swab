import { CType } from './types'

export type Env = {
  wasmFile: string,
  wrapperCache: { [key: string]: string },
  accessorTable: { [key: string]: { [field: string]: { getter?: string, setter?: string } } },
  constructorTable: { [key: string]: string },
  destructorTable: { [key: string]: string },
  copyTable: { [key: string]: string },
  sizeofTable: { [key: string]: string },
  i64Table: { [key: string]: string },
  c2jsTable: { [key: string]: string },
  substitutions: { [key: string]: CType },
  jsBuffer: string,
  cBuffer: string,
  imports: Set<string>,
  exports: Set<string>
}

export function createEnv(wasmFile: string): Env {
  return {
    wasmFile,
    wrapperCache: {},
    accessorTable: {},
    constructorTable: {},
    destructorTable: {},
    copyTable: {},
    sizeofTable: {},
    i64Table: {},
    c2jsTable: {},
    substitutions: {
      'int8_t': { kind: 'i8' },
      'uint8_t': { kind: 'u8' },

      'short': { kind: 'i16' },
      'int16_t': { kind: 'i16' },
      'unsigned short': { kind: 'u16' },
      'uint16_t': { kind: 'u16' },

      'int': { kind: 'i32' },
      'int32_t': { kind: 'i32' },
      'unsigned int': { kind: 'u32' },
      'uint32_t': { kind: 'u32' },
      'size_t': { kind: 'u32' },

      'long': { kind: 'i64' },
      'int64_t': { kind: 'i64' },
      'unsigned long': { kind: 'u64' },
      'uint64_t': { kind: 'u64' },

      'float': { kind: 'f32' },
      'double': { kind: 'f64' },

      '__wasm_big_int': { kind: 'pointer', to: { kind: 'void' } }
    },
    // TODO: Handle escape codes in wasmFile name
    jsBuffer: `
import * as swab from 'swablib';

swab.__wasm_load('${wasmFile}');

function __wasm_identity(__x) {
  return __x;
}
`,
    cBuffer: `
#include <swablib.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
`,
    imports: new Set([]),
    exports: new Set([ 'malloc', 'free' ])
  }
}

let uniq = 0
export function gensym(name: string = 'uniq'): string {
  return `__${name}${uniq++}`
}
