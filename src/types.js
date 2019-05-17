import { gensym } from './env.js'

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

// TODO: Can we delete this?
export const c2js_type = c => {
  switch (c.type) {
  case 'bool':
    return { type: 'boolean', params: [], orig: c }
  case 'char':
    return { type: 'string', params: [], orig: c }
  case 'u8':
  case 'i8':
  case 'u16':
  case 'i16':
  case 'u32':
  case 'i32':
  case 'u64':
  case 'i64':
  case 'f32':
  case 'f64':
    return { type: 'number', params: [], orig: c }
  case 'pointer':
    switch (c.params[0].type) {
    case 'char':
      return { type: 'string', params: [], orig: c }
    case 'void':
      return { type: 'any', params: [], orig: c }
    default: // TODO: Does this work in all cases? Maybe add a pointer type to JS?
      let result = c2js_type(c.params[0])
      result.orig = c // Override the orig field
      return result
    }
  case 'array':
    // TODO: Is including the extra params the right way to go about this?
    return { type: 'array', params: c.params.map(c2js_type), orig: c }
  case 'functionPointer':
    return { type: 'function', params: [
      c.params[0].map(c2js_type), // param types
      c2js_type(c.params[1])      // return type
    ], orig: c}
  case 'enum':
    // TODO:
  case 'struct':
    let newparams = {}
    // TODO: Should this be like [[k, v]] instead of { k: v } (for consistency)?
    for (key in c.params) {
      newparams[key] = c2js_type(c.params[key])
    }
    return { type: 'object', params: newparams, orig: c }
  case 'union':
    // TODO:
  case 'void':
    return { type: 'void', params: [], orig: c }
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
      return (
`
(${charPtr} => {
  let ${str} = ''

  let ${char}
  let ${idx} = 0
  while ((${charVal} = ${env.memoryname}[${charPtr} + ${charIdx}++]) != 0) {
    ${str} += String.fromCharCode(${charVal})
  }

  return ${str}
})
`)
    default:
      // TODO: This'll assume that the pointer points to a single item... Any way to improve?
      const ptr = gensym()
      return `(${ptr} => ${c2js(env, c.params[0])}(${env.memoryname}[${ptr}]))`
    }
  case 'array':
    // TODO: How will memory indexing work here? Do we have to calculate the size of the type?
    // Can we assume every element is an i32?
    const cArray = gensym(), array = gensym(), idx = gensym()
    const elemtype = c.params[0]
    const arrsize = c.params[1]
    const typesize = env.sizeof(elemtype)

    return (
`
(${cArray} => {
  let ${array} = []
  for (let ${idx} = 0; ${idx} < ${arrsize}; ${idx}++) {
    ${array}.push(${c2js(env, elemtype)}(${env.memoryname}[${cArray} + ${typesize} * ${idx}]))
  }
  return ${array}
})
`)
  case 'functionPointer':
    /* Multi-step process:
     * - Figure out what the equivalent JS types are
     * - Setup code to perform the JS->C conversions for args + return value
     * - Do the conversion into a JS function
     */
    const paramtypes = c.params[0]
    const returntype = c.params[1]

    const cparams = paramtypes.map(cfromjs)
    const creturn = cfromjs(returntype)

    const fp = gensym(), result = gensym(), id = gensym(), paramNames = paramtypes.map(_ => gensym())

    const castparams = paramNames.map((name, idx) =>
      `${cparams[idx]}(${name})`
    )

    // TODO: If it returns void don't do anything with the result value
    // FIXME: the ++/-- won't cut it here, what if we add 2 functions but wait to call them? We need to think like malloc here...
    // TODO: Can we statically perform the function wrapping? Everything but the inner function is known statically.
    return (
`
(${fp} => {
  const ${id} = ${env.tablebasename}++
  ${env.tablename}.set(
    ${id},
    ${env.wrapfnname}(
      (${paramNames}) => {
        const ${result} =
          ${creturn}(${fp}(${castparams}))
        ${env.tablebasename}--
        return ${result}
      },
      [${paramtypes.map(x => "'" + c2wasm_type(x) + "'")}],
      ${"'" + c2wasm_type(returntype) + "'"}
    )
  )
  return ${id}
})
`)
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

export function cfromjs(type) {
  return id()
}

export function test(env) {
  let my_c_type = {
    type: 'functionPointer',
    params: [
      [
        { type: 'u64', params: [] },
        { type: 'char', params: [] },
        { type: 'pointer', params: [ { type: 'char', params: [] } ] },
        { type: 'array', params: [ { type: 'int', params: [] }, 3] }
      ],
      { type: 'void', params: [] }
    ]
  }
  return c2js(env, my_c_type)
}
