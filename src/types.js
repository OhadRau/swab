import { gensym } from './env.js'
import { type2ctype, wrapSizeof, wrapAccessors } from './gen_c.js'

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

function id(env) {
  const idFunction = gensym(), name = gensym()
  env.jsBuffer += `
function ${idFunction}(${name}) {
  return ${name};
}`
  return idFunction
}

// QUESTION: How do we deal with recursion?
export function substitute(env, type) {
  switch (type.type) {
    case 'bool':
    case 'char':
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
    case 'enum':
    case 'void':
      return type;
    case 'pointer':
      return { type: type.type, params: [substitute(env, type.params[0])] }
    case 'array':
      return { type: type.type, params: [substitute(env, type.params[0]), type.params[1]] }
    case 'functionPointer':
      return { type: 'functionPointer', params: [
	[ type.params[0].map(subtype => substitute(env, subtype)) ],
	[ substitute(env, type.params[1]) ]
      ] }
    case 'struct':
    case 'union':
      const newFields = {}
      for (let field in type.params) {
	newFields[field] = substitute(env, type.params[field])
      }
      return { type: type.type, params: newFields }
    default:
      if (type.type in env.substitutions) {
	// In order to not infinite loop on recursion, we don't keep substituting
	return env.substitutions[type.type]
      } else {
	return { type: 'void', params: [] }
      }
  }
}

export function c2wasm_type(c) {
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

export function c2pointer_type(c) {
  switch (c.type) {
    case 'bool':
    case 'char':
    case 'u8':
      return 'u8'
    case 'i8':
      return 'i8'
    case 'u16':
      return 'u16'
    case 'i16':
      return 'i16'
    case 'u32':
    case 'array':
    case 'pointer':
    case 'enum':
    case 'functionPointer':
      return 'u32'
    case 'i32':
      return 'i32'
    case 'u64':
      return 'u64'
    case 'i64':
      return 'i64'
    case 'f32':
      return 'f32'
    case 'f64':
      return 'f64'
    default:
      return c.type
  }
}

export function getSizeof(env, c) {
  let type = substitute(env, c)
  let key = JSON.stringify(type)
  if (key in env.sizeofTable) {
    return env.sizeofTable[key]
  } else {
    return wrapSizeof(env, type)
  }
}

export function getAccessors(env, c) {
  let type = substitute(env, c)
  let key = JSON.stringify(type)
  if (key in env.accessorTable) {
    return env.accessorTable[key]
  } else {
    return wrapAccessors(env, type)
  }
}

// QUESTION: Do we actually need this mess? Hopefully not...
// Sometimes, we need to read memory from a buffer and convert to JS data
export function buffer2js(env, c) {
  const buffer = gensym()
  switch (c.type) {
  case 'bool':
  case 'char':
  case 'i8':
  case 'u8':
    return `(${buffer} => ${buffer}[0])`
  case 'i16':
  case 'u16':
    return `(${buffer} => (${buffer}[1] << 8) | ${buffer}[0])`
  case 'i32':
    return `(${buffer} => (${buffer}[3] << 24) | (${buffer}[2] << 16) | (${buffer}[1] << 8) | ${buffer}[0])`
  case 'u32':
    return `(${buffer} => (${buffer}[3] << 24) | (${buffer}[2] << 16) | (${buffer}[1] << 8) | ${buffer}[0] + 4294967295 + 1)`
  case 'i64':
    return `
(${buffer} =>
  (BigInt(${buffer}[7]) * (56n ** 8n)) + (BigInt(${buffer}[6]) * (48n ** 8n)) +
  (BigInt(${buffer}[5]) * (40n ** 8n)) + (BigInt(${buffer}[4]) * (32n ** 8n)) +
  (BigInt(${buffer}[3]) * (24n ** 8n)) + (BigInt(${buffer}[2]) * (2n ** 16n)) +
  (BigInt(${buffer}[1]) * (2n ** 8n)) + BigInt(${buffer}[0])
)`
  case 'u64':
    return `
(${buffer} =>
  (BigInt(${buffer}[7]) * (56n ** 8n)) + (BigInt(${buffer}[6]) * (48n ** 8n)) +
  (BigInt(${buffer}[5]) * (40n ** 8n)) + (BigInt(${buffer}[4]) * (32n ** 8n)) +
  (BigInt(${buffer}[3]) * (24n ** 8n)) + (BigInt(${buffer}[2]) * (2n ** 16n)) +
  (BigInt(${buffer}[1]) * (2n ** 8n)) + BigInt(${buffer}[0]) + 18446744073709551615n + 1n
)`
  case 'f32':
    return `(${buffer} => (${buffer}[3] * (2 ** 24)) + (${buffer}[2] * (2 ** 16)) + (${buffer}[1] * (2 ** 8)) + ${buffer}[0])`
  case 'f64':
    return `
(${buffer} =>
  (${buffer}[7] * (2 ** 56)) + (${buffer}[6] * (2 ** 48)) +
  (${buffer}[5] * (2 ** 40)) + (${buffer}[4] * (2 ** 32)) +
  (${buffer}[3] * (2 ** 24)) + (${buffer}[2] * (2 ** 16)) +
  (${buffer}[1] * (2 ** 8)) + ${buffer}[0]
)`
  case 'pointer':
    // QUESTION: Do we have to recurse any further?
    const convertor = buffer2js(env, c.params[0])
    return `
(${buffer} => {
  const addr = (${buffer}[3] << 24) | (${buffer}[2] << 16) | (${buffer}[1] << 8) | ${buffer}[0];
  return new __WasmPointer(addr, ${convertor}, ${getSizeof(env, c.params[0])}(), ${c2pointer_type(c.params[0])});
})`
  case 'array':
    const array = gensym(), size = gensym(), idx = gensym(), subBuffer = gensym()
    const type = c.params[0], length = c.params[1]
    return `
(${buffer} => {
  let ${array} = [];
  const ${size} = ${getSizeof(env, type)}();
  for (let ${idx} = 0; ${idx} < ${length}; ${idx} += ${size}) {
    let ${subBuffer} = ${buffer}.slice(${idx}, ${idx} + ${size});
    ${array}[${idx}] = ${buffer2js(env, type)}(${subBuffer});
  }
  return ${array};
})`
  case 'functionPointer':
    const paramtypes = c.params[0]
    const returntype = c.params[1]

    const addr = gensym()
    const paramnames = paramtypes.map(_ => gensym())

    const params2c = paramtypes.map(type => js2c(env, type))
    const return2c = js2c(env, returntype)

    const wrappedParams = params2c.map((wrap, id) => `${wrap}(${paramnames[id]})`)

    return `
(${buffer} => {
  const ${addr} = (${buffer}[3] << 24) | (${buffer}[2] << 16) | (${buffer}[1] << 8) | ${buffer}[0];
  return (${paramnames.join(',')}) =>
    ${return2c}(
      __wasm_table.get(${addr})(${wrappedParams})
    );
})
`
  case 'enum':
    // Assume the enum is always i32
    const value = gensym()
    return `
(${buffer} => {
  let ${value} = (${buffer}[3] << 24) | (${buffer}[2] << 16) | (${buffer}[1] << 8) | ${buffer}[0];
  return ${JSON.stringify(c.params)}[${value}];
})`
  case 'struct':
  case 'union':
    return c2js(env, c)
  case 'void':
    break
  }
}

/* Generate code for type conversion from C -> JS
 * @return Conversion code (string) if conversion is necessary, otherwise `false`
 */
export function c2js(env, c) {
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

  // Perform caching to handle recursive case
  const key = JSON.stringify(c)
  if (key in env.c2jsTable) {
    return env.c2jsTable[key]
  }
  switch (c.type) {
    case 'bool':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'char':
      const c2char = gensym(), char = gensym()
      env.jsBuffer += `
function ${c2char}(${char}) {
  return String.fromCharCode(${char}));
}
`
      env.c2jsTable[key] = c2char
      return c2char
    case 'u8':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'i8':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'u16':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'i16':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'u32':
      const c2u32 = gensym(), u32 = gensym()
      env.jsBuffer += `
function ${c2u32}(${u32}) {
  return ${u32} + 4294967295 + 1;
}
`
      env.c2jsTable[key] = c2u32
      return c2u32
    case 'i32':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'u64':
      const c2u64 = gensym(), u64 = gensym()
      env.jsBuffer += `
function ${c2u64}(${u64}) {
  return ${u64} + 18446744073709551615n + 1n;
}
`
      env.c2jsTable[key] = c2u64
      return c2u64
    case 'i64':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'f32':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'f64':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    case 'pointer':
      switch (c.params[0].type) {
      case 'char':
	const c2str = gensym(), charPtr = gensym(), str = gensym(), charVal = gensym(), charIdx = gensym()
	env.jsBuffer += `
function ${c2str}(${charPtr}) {
  let ${str} = '';

  let ${char};
  let ${idx} = 0;
  while ((${charVal} = __wasm_memory[${charPtr} + ${charIdx}++]) != 0) {
    ${str} += String.fromCharCode(${charVal});
  }

  return ${str};
}
`
	env.c2jsTable[key] = c2str
	return c2str
      case 'bool':
      case 'char':
      case 'u8': case 'i8':
      case 'u16': case 'i16':
      case 'u32': case 'i32':
      case 'u64': case 'i64':
      case 'f32': case 'f64':
	// If type is numeric (or numeric-ish), don't convert signded-ness, as the __WasmPointer impl covers this
	// I *think* pointers and arrays are ok because we don't do any sign changing for those
	const c2numptr = gensym(), numptr = gensym()
	env.jsBuffer += `
function ${c2numptr}(${numptr}) {
  return new __WasmPointer(${numptr}, ${id()}, ${getSizeof(env, c)}, ${c2pointer_type(c.params[0])});
}
`
	env.c2jsTable[key] = c2numptr
	return c2numptr
      case 'pointer':
      case 'functionPointer':
      case 'array':
      case 'struct':
      case 'union':
      case 'enum':
      case 'void':
	const c2ptr = gensym(), ptr = gensym()
	const convert = c2js(env, c.params[0])
	env.jsBuffer += `
function ${c2ptr}(${ptr}) {
  return new __WasmPointer(${ptr}, ${convert}, ${getSizeof(env, c)}(), ${c2pointer_type(c.params[0])});
}
`
	env.c2jsTable[key] = c2ptr
	return c2ptr
      default:
	// Unknown type, let's perform a substitution
	return c2js(env, { type: "pointer", params: [ substitute(env, c.params[0]) ] })
      }
    case 'array':
      const c2arr = gensym(), cArray = gensym(), array = gensym(), idx = gensym(), ptr = gensym()
      const elemtype = c.params[0]
      const arrsize = c.params[1]
      const typesize = getSizeof(env, c)

      const convert = c2js(env, elemtype)
      env.jsBuffer += `
function ${c2arr}(${cArray}) {
  let ${array} = [];
  let ${ptr} = new __WasmPointer(${cArray}, ${convert}, ${typesize}(), ${c2pointer_type(elemtype)});
  for (let ${idx} = 0; ${idx} < ${arrsize}; ${idx}++) {
    ${array}[${idx}] = ${convert}(${ptr}.offset(idx));
  }
  return ${array};
}
`
      env.c2jsTable[key] = c2arr
      return c2arr
    case 'functionPointer':
      const paramtypes = c.params[0]
      const returntype = c.params[1]

      const c2fp = gensym(), fp = gensym()
      const paramnames = paramtypes.map(_ => gensym())

      const params2c = paramtypes.map(type => js2c(env, type))
      const return2c = js2c(env, returntype)

      const wrappedParams = params2c.map((wrap, id) => `${wrap}(${paramnames[id]})`)

      jsBuffer += `
function ${c2fp}(${fp}) {
  return (${paramnames.join(',')}) =>
    ${return2c}(
      __wasm_table.get(${fp})(${wrappedParams})
    );
}
`
      env.c2jsTable[key] = c2fp
      return c2fp
    case 'enum':
      const c2enum = gensym(), name = gensym()
      jsBuffer += `
function ${c2enum}(${name}) {
  return ${JSON.stringify(c.params)}[${name}];
}
`
      env.c2jsTable[key] = c2enum
      return c2enum
    case 'struct':
    case 'union':
      /* So interesting question here: setters really only make
       * sense on pointers (otherwise the setter won't actually
       * do anything). However, here we're generating accessors
       * for a non-pointer type. The proper behavior is probably
       * to only support getters/setters on pointers, but what do
       * we do instead in this case? If it's a non-pointer type
       * maybe we want to generate only getters and convert it to
       * a JS object? */
      const accessors = getAccessors(env, c)

      let methods = []
      const c2obj = gensym(), obj = gensym()
      for (let field in c.params) {
	const value = gensym()
	methods.push(`get_${field}: (() => ${accessors[field]['getter']}(${obj}))`)
	methods.push(`set_${field}: ((${value}) => ${accessors[field]['setter']}(${obj}, ${value}))`)
      }

      /* HACK: We pass both the dereferenced version and the pointer
       * in `__WasmPointer.derefAndConvert` so that we can preserve
       * the pointer semantics when the user tries to access the
       * values. TODO: Change this to something more sensible once we
       * decide upon the final struct pointer semantics. */
      env.jsBuffer += `
function ${c2obj}(_, ${obj}) {
  return {
    ${methods.join(',')}
  };
}
`
      env.c2jsTable[key] = c2obj
      return c2obj
    case 'void':
      env.c2jsTable[key] = id(env)
      return env.c2jsTable[key]
    default:
      return c2js(env, substitute(env, c))
  }
}

export function js2c(env, c) {
  switch (c.type) {
    case 'bool':
      return id(env)
    case 'char':
      const char = gensym()
      return `(${char} => ${char}.charCodeAt(0))`
    case 'u8':
      return id(env)
    case 'i8':
      return id(env)
    case 'u16':
      return id(env)
    case 'i16':
      return id(env)
    case 'u32':
      const u32 = gensym()
      return `(${u32} => ${u32} - 4294967295 - 1)`
    case 'i32':
      return id(env)
    case 'u64':
      // TODO: This case is tricky. We might need to generate more C
      // I believe we need to split back into upper/lower int32s here and wrap the other function
      // Solution = wrapI64'ing the other function and returning an [upper, lower] array here?
      break
    case 'i64':
      return id(env)
    case 'f32':
      return id(env)
    case 'f64':
      return id(env)
    case 'pointer':
      // TODO: If it's a string we'll need to allocate memory here
      const ptr = gensym()
      return `(${ptr} => ${ptr}.addr)`
    case 'array':
      // TODO: Again, we'll need to allocate memory
      break
    case 'functionPointer':
      /* Multi-step process:
       * - Figure out what the equivalent JS types are
       * - Setup code to perform the JS->C conversions for args + return value
       * - Do the conversion into a JS function
       */
      const paramtypes = c.params[0]
      const returntype = c.params[1]

      const cparams = paramtypes.map(ctype => c2js(env, ctype))
      const creturn = c2js(env, returntype)

      const fp2c = gensym(), fp = gensym(), result = gensym(), id = gensym(), paramNames = paramtypes.map(_ => gensym())

      const castparams = paramNames.map((name, idx) =>
					`${cparams[idx]}(${name})`
				       )

      // TODO: If it returns void don't do anything with the result value
      // TODO: Can we statically perform the function wrapping? Everything but the inner function is known statically.
      env.jsBuffer += `
function ${c2fp}(${fp}) {
  const ${id} = __wasm_table_alloc();
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
  );
  return ${id};
}
`
      env.js2cTable[key] = c2fp
      return fp2c
    case 'enum':
    case 'struct':
    case 'union':
    case 'void':
      return id(env)
    default:
      return id(env)
  }
}
