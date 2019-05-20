import { gensym } from './env.js'
import { type2ctype } from './gen_c.js' // Avoid circular dependencies pls

export const jstypes = Object.freeze([
  'boolean',
  'number',
  'string',
  'array',
  'object',
  'function',
  'void',
  'null',
  'undefined',
  'any'
])

export const ctypes = Object.freeze([
  'bool',
  'char',
  'u8', 'i8',
  'u16', 'i16',
  'u32', 'i32',
  'u64', 'i64',
  'f32',
  'f64',
  'pointer',
  'array',
  'functionPointer',
  'enum',
  'struct',
  'union',
  'void'
])

const id = () => {
  const name = gensym()
  return `(${name} => ${name})`
}

export const c2wasm_type = c => {
  switch (c.type) {
    case 'u64': case 'i64':
      return 'i64'
    case 'f32':
      return 'f32'
    case 'f64':
      return 'f64'
    case 'void':
      return 'void'
    default:
      return 'i32'
  }
}

export const getSizeof = (c) => {
  let key = type2ctype(c)
  if (key in env.sizeofTable) {
    return env.sizeofTable[key]
  } else {
    return wrapSizeof(env, c)
  }
}


/* Generate code for type conversion from C -> JS
 * @return Conversion code (string) if conversion is necessary, otherwise `false`
 */
export const c2js = (env, c) => {
  /* How does signed/unsigned conversion work?
   * WASM doesn't store 'signededness,' but the
   * default interpretation is going to be as a
   * signed int. However, this only matters when
   * we fill up an entire integer. HOWEVER, the
   * JS spec only exposes floating point numbers
   * by default. If we do the ASM.js trick by
   * n | 0, then we get a 32-bit (signed) integer
   * -- not large enough for the i64 type. Floats
   * are probably the best option. In theory the
   * integers should already be sign-extended to
   * the correct size, so we don't need to worry
   * about resizing. The only error comes up with
   * unsigned integers of size 32/64. They will
   * get interpreted as signed ints, so if one of
   * these is negative we can just add the proper
   * offset (max unsigned int of that size + 1)
   * to make them match the proper unsigned value.
   * FUN FACT: the WASM engine in V8 doesn't let
   * you call functions that use i64 from JS, so
   * this may take some special work to make it
   * happen.
   */
  switch (c.type) {
  case 'bool':
    return id()
  case 'char':
    const char = gensym()
    return `(${char} => String.fromCharCode(${char}))`
  case 'u8':
    return id()
  case 'i8':
    return id()
  case 'u16':
    return id()
  case 'i16':
    return id()
  case 'u32':
    const u32 = gensym()
    return `(${u32} => ${u32} + 4294967295n + 1n)`
  case 'i32':
    return id()
  // TODO: Generate wrapper functions to handle u64/i64 returns/params & have wrapper lookup table
  case 'u64':
    const u64 = gensym()
    return `(${u64} => ${u64} + 18446744073709551615n + 1n)`
  case 'i64':
    return id()
  case 'f32':
    return id()
  case 'f64':
    return id()
  case 'pointer':
    switch (c.params[0].type) {
    case 'char':
      const charPtr = gensym(), str = gensym(), charVal = gensym(), charIdx = gensym()
      return `
(${charPtr} => {
  let ${str} = ''

  let ${char}
  let ${idx} = 0
  while ((${charVal} = __wasm_memory[${charPtr} + ${charIdx}++]) != 0) {
    ${str} += String.fromCharCode(${charVal})
  }

  return ${str}
})
`
    default:
      const ptr = gensym()
      return `(${ptr} => new __WasmPointer(${ptr}, ${c2js(env, c.params[0])}, ${getSizeof(c)}())`
    }
  case 'array':
    // TODO: How will memory indexing work here? Do we have to calculate the size of the type?
    // Can we assume every element is an i32?
    const cArray = gensym(), array = gensym(), idx = gensym()
    const elemtype = c.params[0]
    const arrsize = c.params[1]
    const typesize = getSizeof(c)

    return `
(${cArray} => {
  let ${array} = []
  for (let ${idx} = 0; ${idx} < ${arrsize}; ${idx}++) {
    ${array}.push(${c2js(env, elemtype)}(__wasm_memory[${cArray} + ${typesize}() * ${idx}]))
  }
  return ${array}
})
`
  case 'functionPointer':
    /* Multi-step process:
     * - Figure out what the equivalent JS types are
     * - Setup code to perform the JS->C conversions for args + return value
     * - Do the conversion into a JS function
     */
    const paramtypes = c.params[0]
    const returntype = c.params[1]

    const cparams = paramtypes.map(ctype => cfromjs(env, ctype))
    const creturn = cfromjs(env, returntype)

    const fp = gensym(), result = gensym(), id = gensym(), paramNames = paramtypes.map(_ => gensym())

    const castparams = paramNames.map((name, idx) =>
      `${cparams[idx]}(${name})`
    )

    // TODO: If it returns void don't do anything with the result value
    // FIXME: the ++/-- won't cut it here, what if we add 2 functions but wait to call them? We need to think like malloc here...
    // TODO: Can we statically perform the function wrapping? Everything but the inner function is known statically.
    return `
(${fp} => {
  const ${id} = __wasm_table_alloc()
  __wasm_table.set(
    ${id},
    __wasm_wrap_function(
      (${paramNames}) => {
        const ${result} =
          ${creturn}(${fp}(${castparams}))
        __wasm_table_free(id)
        return ${result}
      },
      [${paramtypes.map(x => "'" + c2wasm_type(x) + "'")}],
      ${"'" + c2wasm_type(returntype) + "'"}
    )
  )
  return ${id}
})
`
  case 'enum':
    break
  case 'struct':
    break
  case 'union':
    break
  case 'void':
    break
  }
}

export function cfromjs(env, c) {
  switch (c.type) {
  default:
    return id()
  }
}
