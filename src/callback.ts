import { gensym, Env } from './env'
import { c2wasm_type, CType, WasmType } from './types'

export function cacheWrapper(env: Env, paramTypes: CType[], returnType: CType): string {
  let wasmParams = <WasmType[]>(paramTypes.map(c2wasm_type))
  let wasmReturn = c2wasm_type(returnType)

  // See: https://github.com/WebAssembly/design/blob/master/BinaryEncoding.md#language-types
  // QUESTION: What are anyfunc/func/empty & can we utilize them?
  const encodeType: { [key in WasmType]: number } =
    { 'i32': 0x7f,
      'i64': 0x7e,
      'f32': 0x7d,
      'f64': 0x7c }

  let wasmTypeInfo =
    [ wasmParams.length,
      ...(wasmParams.map(x => encodeType[x])),
      ...(wasmReturn === 'void' ? [0x00] : [0x01, encodeType[wasmReturn]]) ]

  let key = JSON.stringify(wasmTypeInfo)

  if (key in env.wrapperCache) {
    return env.wrapperCache[key]
  }

  let wrapperId = gensym('wrapperId')
  env.wrapperCache[key] = wrapperId

  // FIXME: This isn't getting outputted anywhere. How should we go about that?
  // QUESTION: Should we compile the module (new WebAssembly.Module) in the output code?
  let wasmProgram =
    [ 0x00, 0x61, 0x73, 0x6d,  // magic number "\0asm"
      0x01, 0x00, 0x00, 0x00,  // version 1.0.0.0
      0x01,                    // type section id
      wasmTypeInfo.length + 2, // type section length (2 extra for count+form)
      0x01,                    // count = 1
      0x60,                    // form = func
      ...wasmTypeInfo,
      0x02, 0x07,              // import section id
      0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00, // (import "e" "f" (func 0 (type 0)))
      0x07, 0x05,              // export section id
      0x01, 0x01, 0x66, 0x00, 0x00 ]            // (export "f" (func 0 (type 0)))

  // Best we can do for caching, since proper module caching was removed from the WASM spec
  env.jsBuffer += `
swab.__wasm_wrapped_functions['${wrapperId}'] = new WebAssembly.Module(
  new Uint8Array([${wasmProgram.join(',')}])
);
`
  return wrapperId
}
