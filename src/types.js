import { gensym } from './env.js'
import { type2ctype, wrapSizeof, wrapAccessors, wrapConstructorDestructor } from './gen_c.js'

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

const id = '__wasm_identity'

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
      return type
    case 'pointer':
      return { type: type.type, params: [substitute(env, type.params[0])], orig: (type.orig || type) }
    case 'array':
      return { type: type.type, params: [substitute(env, type.params[0]), type.params[1]], orig: (type.orig || type) }
    case 'functionPointer':
      return { type: 'functionPointer', params: [
        [ type.params[0].map(subtype => substitute(env, subtype)) ],
        [ substitute(env, type.params[1]) ]
      ], orig: (type.orig || type) }
    case 'struct':
    case 'union':
      const newFields = {}
      for (let field in type.params) {
        newFields[field] = substitute(env, type.params[field])
      }
      return { type: type.type, params: newFields, orig: (type.orig || type) }
    default:
      if (type.type in env.substitutions) {
        // In order to not infinite loop on recursion, we don't keep substituting
        let result = env.substitutions[type.type]
        result.orig = type.orig || type
        return result
      } else {
        return { type: 'void', params: [], orig: (type.orig || type) }
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
    exports.add(env.sizeofTable[key])
    return `__wasm_exports.${env.sizeofTable[key]}`
  } else {
    const sizeof = wrapSizeof(env, type)
    env.exports.add(sizeof)
    return `__wasm_exports.${sizeof}`
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

export function getConstructor(env, c) {
  let type = substitute(env, c)
  let key = JSON.stringify(type)
  if (key in env.constructorTable) {
    return env.constructorTable[key]
  } else {
    return wrapConstructorDestructor(env, type)[0]
  }
}

export function getDestructor(env, c) {
  let type = substitute(env, c)
  let key = JSON.stringify(type)
  if (key in env.destructorTable) {
    return env.destructorTable[key]
  } else {
    return wrapConstructorDestructor(env, type)[1]
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
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'char':
      const c2char = gensym('c2char'), char = gensym('char')
      env.jsBuffer += `
function ${c2char}(${char}) {
  return String.fromCharCode(${char}));
}
`
      env.c2jsTable[key] = c2char
      return c2char
    case 'u8':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'i8':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'u16':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'i16':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'u32':
      const c2u32 = gensym('c2u32'), u32 = gensym('u32')
      env.jsBuffer += `
function ${c2u32}(${u32}) {
  return ${u32} + 4294967295 + 1;
}
`
      env.c2jsTable[key] = c2u32
      return c2u32
    case 'i32':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'u64':
      const c2u64 = gensym('c2u64'), u64 = gensym('u64')
      env.jsBuffer += `
function ${c2u64}(${u64}) {
  return ${u64} + 18446744073709551615n + 1n;
}
`
      env.c2jsTable[key] = c2u64
      return c2u64
    case 'i64':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'f32':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'f64':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'pointer':
      switch (c.params[0].type) {
      case 'char':
        const c2str = gensym('c2str'), charPtr = gensym('charPtr'), str = gensym('str')
        const charVal = gensym('charVal'), charIdx = gensym('charIndex')
        env.jsBuffer += `
function ${c2str}(${charPtr}) {
  let ${str} = '';

  let ${charVal};
  let ${charIdx} = 0;
  while ((${charVal} = __wasm_memory[${charPtr} + ${charIdx}++]) != 0) {
    ${str} += String.fromCharCode(${charVal});
  }

  return ${str};
}
`
        env.c2jsTable[key] = c2str
        return c2str
      case 'u8': case 'i8':
      case 'u16': case 'i16':
      case 'u32': case 'i32':
      case 'u64': case 'i64':
      case 'f32': case 'f64':
        // If type is numeric, don't convert signded-ness, as the __WasmPointer impl covers this
        // I *think* pointers and arrays are ok because we don't do any sign changing for those
        const c2numptr = gensym('c2numptr'), numptr = gensym('numptr')
        env.jsBuffer += `
function ${c2numptr}(${numptr}) {
  return new __WasmPointer(${numptr}, ${id}, ${id}, ${getSizeof(env, c)}(), '${c2pointer_type(c.params[0])}');
}
`
        env.c2jsTable[key] = c2numptr
        return c2numptr
      case 'struct':
      case 'union':
        /* As described in gen_c.js, we explicitly handle the separate case of reference types vs.
         * value types here. The primary reason in this case is caching, as we don't want to cache
         * the pointer version of the accessors and the value version of the accessors under the same
         * name. */
        const key = JSON.stringify(c)
        const subtype = c.params[0]

        const accessors = getAccessors(env, c)

        let methods = []
        const c2obj = gensym('c2object'), obj = gensym('object')
        for (let field in subtype.params) {
          const value = gensym('value')
          const to_js = c2js(env, subtype.params[field]), to_c = js2c(env, subtype.params[field])

          const getter = accessors[field]['getter'], setter = accessors[field]['setter']

          env.exports.add(getter)
          methods.push(`get_${field}: (() => ${to_js}(__wasm_exports.${getter}(${obj})))`)

          env.exports.add(setter)
          methods.push(`set_${field}: ((${value}) => ${to_c}(__wasm_exports.${setter}(${obj}, ${value})))`)
        }

        const destroy = getDestructor(env, c)
        if (destroy) {
          methods.push(`destroy: (() => __wasm_exports.${destroy}(${obj}))`)
        }

        env.jsBuffer += `
function ${c2obj}(${obj}) {
  return {
    ${methods.join(',\n    ')}
  };
}
`
        env.c2jsTable[key] = c2obj
        return c2obj
      case 'bool':
      case 'char':
      case 'pointer':
      case 'functionPointer':
      case 'array':
      case 'enum':
      case 'void':
        const c2ptr = gensym('c2ptr'), ptr = gensym('ptr')
        const convert = c2js(env, c.params[0])
        const unconvert = js2c(env, c.params[0])
        env.jsBuffer += `
function ${c2ptr}(${ptr}) {
  return new __WasmPointer(${ptr}, ${convert}, ${unconvert}, ${getSizeof(env, c)}(), '${c2pointer_type(c.params[0])}');
}
`
        env.c2jsTable[key] = c2ptr
        return c2ptr
      default:
        // Unknown type, let's perform a substitution
        return c2js(env, { type: "pointer", params: [ substitute(env, c.params[0]) ] })
      }
    case 'array':
      const c2arr = gensym('c2array'), cArray = gensym('cArray'), array = gensym('array')
      const idx = gensym('index'), ptr = gensym('pointer')
      const elemtype = c.params[0]
      const arrsize = c.params[1]
      const typesize = getSizeof(env, c)

      const convert = c2js(env, elemtype), unconvert = js2c(env, elemtype)
      env.jsBuffer += `
function ${c2arr}(${cArray}) {
  let ${array} = [];
  let ${ptr} = new __WasmPointer(${cArray}, ${convert}, ${unconvert} ${typesize}(), '${c2pointer_type(elemtype)}');
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

      const c2fp = gensym('c2functionPointer'), fp = gensym('functionPointer')
      const paramnames = paramtypes.map(_ => gensym('param'))

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
      const c2enum = gensym('c2enum'), name = gensym('enum')
      jsBuffer += `
function ${c2enum}(${name}) {
  return ${JSON.stringify(c.params)}[${name}];
}
`
      env.c2jsTable[key] = c2enum
      return c2enum
    case 'struct':
    case 'union':
      const accessors = getAccessors(env, c)

      let methods = []
      const c2obj = gensym('c2object'), obj = gensym('object')
      for (let field in c.params) {
        const value = gensym('value')
        const to_js = c2js(env, c.params[field]), to_c = js2c(env, c.params[field])

        const getter = accessors[field]['getter']

        env.exports.add(getter)
        methods.push(`get_${field}: (() => ${to_js}(__wasm_exports.${getter}(${obj})))`)
      }

      const destroy = getDestructor(env, c)
      if (destroy) {
        methods.push(`destroy: (() => __wasm_exports.${destroy}(${obj}))`)
      }

      env.jsBuffer += `
function ${c2obj}(${obj}) {
  return {
    ${methods.join(',\n    ')}
  };
}
`
      env.c2jsTable[key] = c2obj
      return c2obj
    case 'void':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    default:
      return c2js(env, substitute(env, c))
  }
}

export function js2c(env, c) {
  switch (c.type) {
    case 'bool':
      return id
    case 'char':
      const char = gensym('char')
      return `(${char} => ${char}.charCodeAt(0))`
    case 'u8':
      return id
    case 'i8':
      return id
    case 'u16':
      return id
    case 'i16':
      return id
    case 'u32':
      const u32 = gensym('u32')
      return `(${u32} => ${u32} - 4294967295 - 1)`
    case 'i32':
      return id
    case 'u64':
      // TODO: This case is tricky. We might need to generate more C
      // I believe we need to split back into upper/lower int32s here and wrap the other function
      // Solution = wrapI64'ing the other function and returning an [upper, lower] array here?
      break
    case 'i64':
      return id
    case 'f32':
      return id
    case 'f64':
      return id
    case 'pointer':
      switch (c.params[0].type) {
      case 'char':
        // NOTE: We want to make sure that the user frees this at some point!
        const str = gensym('string'), charPtr = gensym('charPtr'), idx = gensym('index')
        env.exports.add('malloc')
        return `
(${str} => {
  const ${charPtr} = new __WasmPointer(
    __wasm_exports.malloc(${str}.length + 1),
    ${c2js(env, c.params[0])},
    ${js2c(env, c.params[0])},
    8,
    'i8'
  );
  for (let ${idx} = 0; ${idx} < ${str}.length; ${idx}++) {
    ${charPtr}.offset(${idx}).assign(${str}[${idx}]);
  }
  // Make sure we write a null terminator & don't try to call a method on 0
  ${charPtr}.offset(${str}.length).assign('\0');
}
`
      default:
        const ptr = gensym('pointer')
        return `(${ptr} => ${ptr}.addr)`
      }
    case 'array':
      // TODO: Again, we'll need to allocate memory. Also, we have to figure out how to memcpy stuff.
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

      const fp2c = gensym('functionPointer2c'), fp = gensym('functionPointer')
      const result = gensym('result'), fpId = gensym('fpId')
      const paramNames = paramtypes.map(_ => gensym('param'))

      const castparams = paramNames.map((name, idx) => `${cparams[idx]}(${name})`)

      // TODO: If it returns void don't do anything with the result value
      // TODO: Can we statically perform the function wrapping? Everything but the inner function is known statically.
      env.jsBuffer += `
function ${c2fp}(${fp}) {
  const ${fpId} = __wasm_table_alloc();
  __wasm_table.set(
    ${fpId},
    __wasm_wrap_function(
      (${paramNames}) => {
        const ${result} =
          ${creturn}(${fp}(${castparams}))
        __wasm_table_free(${fpId})
        return ${result}
      },
      [${paramtypes.map(x => "'" + c2wasm_type(x) + "'")}],
      ${"'" + c2wasm_type(returntype) + "'"}
    )
  );
  return ${fpId};
}
`
      env.js2cTable[key] = c2fp
      return fp2c
    case 'enum':
      // Reverse the enum definition and index into that
      const enum2num = {}
      for (let i in c.params) {
        enum2num[c.params[i]] = i
      }
      const name = gensym('enum')
      return `(${name} => ${JSON.stringify(enum2num)}[${name}])`
    case 'struct':
    case 'union':
      // TODO: Add struct+union constructors (and destructors)
      // QUESTION: Maybe we should just write to a pointer? Or else create a copy?
      // A wrapper function for the & operator would help a lot if copying
    case 'void':
      return id
    default:
      return id
  }
}
