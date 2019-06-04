import { gensym, Env } from './env.js'
import { cacheWrapper } from './callback.js'
import { wrapSizeof, wrapAccessors, wrapConstructorDestructor, wrapCopy } from './gen_c.js'

interface Bool { kind: "bool", orig?: CType }
interface Char { kind: "char", orig?: CType }
interface U8 { kind: "u8", orig?: CType }
interface I8 { kind: "i8", orig?: CType }
interface U16 { kind: "u16", orig?: CType }
interface I16 { kind: "i16", orig?: CType }
interface U32 { kind: "u32", orig?: CType }
interface I32 { kind: "i32", orig?: CType }
interface U64 { kind: "u64", orig?: CType }
interface I64 { kind: "i64", orig?: CType }
interface F32 { kind: "f32", orig?: CType }
interface F64 { kind: "f64", orig?: CType }
interface Pointer {
  kind: "pointer",
  to: CType,
  orig?: CType
}
interface Array {
  kind: "array",
  of: CType,
  length: number,
  orig?: CType
}
interface FunctionPointer {
  kind: "functionPointer",
  takes: CType[],
  returns: CType,
  orig?: CType
}
interface Enum {
  kind: "enum",
  values: { [key: string]: number },
  orig?: CType
}
interface Struct {
  kind: "struct",
  fields: { [key: string]: CType },
  orig?: CType
}
interface Union {
  kind: "union",
  fields: { [key: string]: CType },
  orig?: CType
}
interface Void { kind: "void", orig?: CType }
interface User { kind: "user", name: string, orig?: CType }

export type CType =
  | Bool
  | Char
  | U8 | I8
  | U16 | I16
  | U32 | I32
  | U64 | I64
  | F32
  | F64
  | Pointer
  | Array
  | FunctionPointer
  | Enum
  | Struct
  | Union
  | Void
  | User

const id: string = '__wasm_identity'

// QUESTION: How do we deal with recursion?
export function substitute(env: Env, ctype: CType): CType {
  switch (ctype.kind) {
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
      return ctype
    case 'pointer':
      return { kind: ctype.kind, to: substitute(env, ctype.to), orig: ctype.orig || ctype }
    case 'array':
      return { kind: ctype.kind, of: substitute(env, ctype.of), length: ctype.length, orig: ctype.orig || ctype }
    case 'functionPointer':
      return {
        kind: ctype.kind,
        takes: ctype.takes.map(ty => substitute(env, ty)),
        returns: substitute(env, ctype.returns),
        orig: ctype.orig || ctype
      }
    case 'struct':
    case 'union':
        const newFields: { [key: string]: CType } = {}
        for (let field in ctype.fields) {
          newFields[field] = substitute(env, ctype.fields[field])
        }
        return <Struct | Union>{ kind: ctype.kind, fields: newFields, orig: ctype.orig || ctype }
    case 'user':
      if (ctype.name in env.substitutions) {
        // In order to not infinite loop on recursion, we don't keep substituting
        let result = env.substitutions[ctype.name]
        result.orig = ctype.orig || ctype
        return result
      } else {
        return { kind: 'void', orig: ctype.orig || ctype }
      }
  }
}

export type WasmType =
  "i32" | "i64" | "f32" | "f64"

export function c2wasm_type(ctype: CType): WasmType | "void" {
  switch (ctype.kind) {
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

export function c2pointer_type(ctype: CType): CType['kind'] {
  switch (ctype.kind) {
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
      return ctype.kind
  }
}

export function cacheTypeInfo(env: Env, types: CType[]) {
  // All user defined types + these types
  types = types.concat([
    { kind: 'bool' },
    { kind: 'char' },
    { kind: 'u8' },
    { kind: 'i8' },
    { kind: 'u16' },
    { kind: 'i16' },
    { kind: 'u32' },
    { kind: 'i32' },
    { kind: 'u64' },
    { kind: 'i64' },
    { kind: 'f32' },
    { kind: 'f64' },
    { kind: 'void' }
  ])
  let typeSpecs: string[] = []
  for (let ctype of types) {
    let subbedType = substitute(env, ctype)
    switch (subbedType.kind) {
      case 'u8': case 'i8':
      case 'u16': case 'i16':
      case 'u32': case 'i32':
      case 'u64': case 'i64':
      case 'f32': case 'f64':
        typeSpecs.push(`
"${ctype.kind === 'user' ? ctype.name : ctype.kind}": {
  c2js: ${id},
  js2c: ${id},
  size: ${getSizeof(env, ctype)}(),
  pointerType: "${c2pointer_type(subbedType)}"
}`)
        break
      default:
        typeSpecs.push(`
"${ctype.kind === 'user' ? ctype.name : ctype.kind}": {
  c2js: ${c2js(env, subbedType)},
  js2c: ${js2c(env, subbedType)},
  size: ${getSizeof(env, ctype)}(),
  pointerType: "${c2pointer_type(subbedType)}"
}`)
    }
  }

  const string: CType = { kind: 'pointer', to: { kind: 'char' } }
  typeSpecs.push(`
"string": {
  c2js: ${c2js(env, string)},
  js2c: ${js2c(env, string)},
  size: ${getSizeof(env, string)}(),
  pointerType: "${c2pointer_type(string)}"
}`)

  // TODO: Edge case -- what if the user does __types.pointer(__types.myStruct)? Do we have to cache that case?
  // TODO: Should this copy over the value?
  // TODO: Create a type spec for arrays
  const void_ptr: CType = { kind: 'pointer', to: { kind: 'void' } }
  const typeSpec = gensym('typeSpec'), ptr = gensym('ptr')
  typeSpecs.push(`
"pointer": (${typeSpec}) => ({
  c2js: (${ptr} => new swab.__WasmPointer(${ptr}, ${typeSpec}.c2js, ${typeSpec}.js2c, ${typeSpec}.size, ${typeSpec}.pointerType)),
  js2c: (${ptr} => ${ptr}.addr),
  size: (${getSizeof(env, void_ptr)}()),
  pointerType: "${c2pointer_type(void_ptr)}"
})`)

// TODO: Test that this actually works in any capacity
const array = gensym('array'), length = gensym('length'), index = gensym('index')
typeSpecs.push(`
"array": (${typeSpec}, ${length}) => ({
  c2js: (${ptr} => {
    for (let ${index} = 0; ${index} < ${length}; ${index}++) {
      ${ptr}[${index}] = ${typeSpec}.c2js(${ptr}.offset(idx));
    }
    return ${ptr};
  }),
  js2c: (${array} => {
    const ${ptr} = new swab.__WasmPointer(
      swab.__wasm_exports.malloc(${array}.length),
      ${typeSpec}.c2js,
      ${typeSpec}.js2c,
      ${typeSpec}.size,
      ${typeSpec}.pointerType
    );
    for (let ${index} = 0; ${index} < ${array}.length; ${index}++) {
      ${typeSpec}.copy(${ptr}.offset(${index}).addr, ${array}[${index}]);
    }

    return ${ptr}.addr;
  }),
  size: (${getSizeof(env, void_ptr)}()),
  pointerType: "${c2pointer_type(void_ptr)}"
})`)

  env.jsBuffer += `
export const __types = {
  ${typeSpecs.join(',\n')}
};
`
}

export function getSizeof(env: Env, ctype: CType): string {
  // Special case for void *s, we don't want to generate a sizeof(void) (illegal) so we'll just use it as a `u8 *`
  if (ctype.kind === 'void') {
    return `(() => 1)`
  }
  let subbed = substitute(env, ctype)
  let key = JSON.stringify(subbed)
  if (key in env.sizeofTable) {
    env.exports.add(env.sizeofTable[key])
    return `swab.__wasm_exports.${env.sizeofTable[key]}`
  } else {
    const sizeof = wrapSizeof(env, ctype)
    env.exports.add(sizeof)
    return `swab.__wasm_exports.${sizeof}`
  }
}

export function getAccessors(env: Env, ctype: CType): { [key: string]: { getter?: string, setter?: string } } {
  let subbed = substitute(env, ctype)
  let key = JSON.stringify(subbed)
  if (key in env.accessorTable) {
    return env.accessorTable[key]
  } else {
    return wrapAccessors(env, ctype)
  }
}

export function getConstructor(env: Env, ctype: CType): string {
  let subbed = substitute(env, ctype)
  let key = JSON.stringify(subbed)
  if (key in env.constructorTable) {
    return env.constructorTable[key]
  } else {
    return wrapConstructorDestructor(env, ctype)[0]
  }
}

export function getDestructor(env: Env, ctype: CType): string {
  let subbed = substitute(env, ctype)
  let key = JSON.stringify(subbed)
  if (key in env.destructorTable) {
    return env.destructorTable[key]
  } else {
    return wrapConstructorDestructor(env, ctype)[1]
  }
}

export function getCopy(env: Env, ctype: CType): string {
  let subbed = substitute(env, ctype)
  let key = JSON.stringify(subbed)
  if (key in env.copyTable) {
    return env.copyTable[key]
  } else {
    return wrapCopy(env, ctype)
  }
}

/* Generate code for type conversion from C -> JS
 * @return Conversion code (string) if conversion is necessary, otherwise `false`
 */
export function c2js(env: Env, ctype: CType): string {
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
  const key = JSON.stringify(ctype)
  if (key in env.c2jsTable) {
    return env.c2jsTable[key]
  }
  switch (ctype.kind) {
    case 'bool':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'char':
      const c2char = gensym('c2char'), char = gensym('char')
      env.jsBuffer += `
function ${c2char}(${char}) {
  return String.fromCharCode(${char});
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
  return BigInt(${u64}) + 18446744073709551615n + 1n;
}
`
      env.c2jsTable[key] = c2u64
      return c2u64
    case 'i64':
      const c2i64 = gensym('c2i64'), i64 = gensym('i64')
      env.jsBuffer += `
function ${c2i64}(${i64}) {
  return BigInt(${i64});
}
`
      env.c2jsTable[key] = c2i64
      return c2i64
    case 'f32':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'f64':
      env.c2jsTable[key] = id
      return env.c2jsTable[key]
    case 'pointer':
      const subtype = ctype.to
      switch (subtype.kind) {
      case 'char':
        const c2str = gensym('c2str'), charPtr = gensym('charPtr'), str = gensym('str')
        const charVal = gensym('charVal'), charIdx = gensym('charIndex')
        env.jsBuffer += `
function ${c2str}(${charPtr}) {
  let ${str} = '';

  let ${charVal};
  let ${charIdx} = 0;
  while ((${charVal} = new Uint8Array(swab.__wasm_memory.buffer)[${charPtr} + ${charIdx}++]) !== 0) {
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
        env.exports.add('free')
        env.jsBuffer += `
function ${c2numptr}(${numptr}) {
  return new swab.__WasmPointer(${numptr}, ${id}, ${id}, ${getSizeof(env, ctype)}(), '${c2pointer_type(ctype.to)}');
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

        const accessors = getAccessors(env, ctype)

        let methods = []
        const c2obj = gensym('c2object'), addr = gensym('address'), obj = gensym('object')
        for (let field in subtype.fields) {
          const value = gensym('value')
          const to_js = c2js(env, subtype.fields[field]), to_c = js2c(env, subtype.fields[field])

          const getter = accessors[field].getter!, setter = accessors[field].setter!

          env.exports.add(getter)
          methods.push(`get ${field}() { return ${to_js}(swab.__wasm_exports.${getter}(${obj})); }`)

          env.exports.add(setter)
          methods.push(`set ${field}(${value}) { ${to_c}(swab.__wasm_exports.${setter}(${obj}, ${value})); }`)
        }

        const destroy = getDestructor(env, ctype)
        if (destroy) {
          methods.push(`destroy: (() => swab.__wasm_exports.${destroy}(${obj}))`)
        }

        // QUESTION: Do we want to wrap this in a __WasmPointer?
        // Pros: ability to offset, ability to manually free, more consistency with pointers
        // Cons: slightly more confusing to the user (x.free() vs. x.deref().destroy()), .assign doesn't make much sense(?)
        env.exports.add('free')
        env.jsBuffer += `
function ${c2obj}(${addr}) {
  return new swab.__WasmPointer(
    ${addr},
    (${obj} => ({
      ${methods.join(',\n      ')}
    })),
    ${js2c(env, ctype)},
    ${getSizeof(env, subtype)}(),
    '${c2pointer_type(subtype)}'
  );
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
        const convert = c2js(env, subtype)
        const unconvert = js2c(env, subtype)
        env.exports.add('free')
        env.jsBuffer += `
function ${c2ptr}(${ptr}) {
  return new swab.__WasmPointer(${ptr}, ${convert}, ${unconvert}, ${getSizeof(env, subtype)}(), '${c2pointer_type(subtype)}');
}
`
        env.c2jsTable[key] = c2ptr
        return c2ptr
      default:
        // Unknown type, let's perform a substitution
        return c2js(env, { kind: "pointer", to: substitute(env, subtype) })
      }
    case 'array':
      const c2arr = gensym('c2array'), cArray = gensym('cArray'), array = gensym('array')
      const idx = gensym('index'), ptr = gensym('pointer')
      const elemtype = ctype.of
      const arrsize = ctype.length
      const typesize = getSizeof(env, elemtype)

      const convert = c2js(env, elemtype), unconvert = js2c(env, elemtype)
      env.exports.add('free')
      env.jsBuffer += `
function ${c2arr}(${cArray}) {
  let ${array} = [];
  let ${ptr} = new swab.__WasmPointer(${cArray}, ${convert}, ${unconvert}, ${typesize}(), '${c2pointer_type(elemtype)}');
  for (let ${idx} = 0; ${idx} < ${arrsize}; ${idx}++) {
    ${array}[${idx}] = ${convert}(${ptr}.offset(idx));
  }
  return ${array};
}
`
      env.c2jsTable[key] = c2arr
      return c2arr
    case 'functionPointer':
      /* C to JS for a function pointer:
       * - The function pointer excepts C params and returns a C result
       * - We want to take JS params and convert them to C params
       * - We want to take the C return value and convert it to JS
      */
      const paramtypes = ctype.takes
      const returntype = ctype.returns

      const c2fp = gensym('c2functionPointer'), fp = gensym('functionPointer')
      const paramnames = paramtypes.map(_ => gensym('param'))

      const params2c = paramtypes.map(type => js2c(env, type))
      const return2js = c2js(env, returntype)

      const wrappedParams = params2c.map((wrap, id) => `${wrap}(${paramnames[id]})`)

      env.jsBuffer += `
function ${c2fp}(${fp}) {
  return (${paramnames.join(',')}) =>
    ${return2js}(
      swab.__wasm_table.get(${fp})(${wrappedParams})
    );
}
`
      env.c2jsTable[key] = c2fp
      return c2fp
    case 'enum':
      const c2enum = gensym('c2enum'), name = gensym('enum')
      let num2enum: { [key: number]: string } = {}
      for (let [key, value] of Object.entries(ctype.values)) {
        num2enum[value] = key
      }
      env.jsBuffer += `
function ${c2enum}(${name}) {
  return ${JSON.stringify(num2enum)}[${name}];
}
`
      env.c2jsTable[key] = c2enum
      return c2enum
    case 'struct':
    case 'union':
      const accessors = getAccessors(env, ctype)

      let methods = []
      const c2obj = gensym('c2object'), obj = gensym('object')
      for (let field in ctype.fields) {
        const value = gensym('value')
        const to_js = c2js(env, ctype.fields[field]), to_c = js2c(env, ctype.fields[field])

        const getter = accessors[field]['getter']!

        env.exports.add(getter)
        methods.push(`get ${field}() { ${to_js}(swab.__wasm_exports.${getter}(${obj})); }`)
      }

      const destroy = getDestructor(env, ctype)
      if (destroy) {
        methods.push(`destroy: (() => swab.__wasm_exports.${destroy}(${obj}))`)
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
      return c2js(env, substitute(env, ctype))
  }
}

export function js2c(env: Env, ctype: CType): string {
  switch (ctype.kind) {
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
      // Solution = wrapI64'ing the other function and returning an [upper, lower] array here? Or returning a BigInt?
      const u64 = gensym('u64')
      return `(${u64} => Number(${u64} - 18446744073709551615n - 1n))`
    case 'i64':
      const i64 = gensym('i64')
      return `(${i64} => Number(${i64}))`
    case 'f32':
      return id
    case 'f64':
      return id
    case 'pointer':
      switch (ctype.to.kind) {
      case 'char':
        // NOTE: We want to make sure that the user frees this at some point!
        const str = gensym('string'), charPtr = gensym('charPtr'), idx = gensym('index')
        env.exports.add('malloc')
        env.exports.add('free')
        return `
(${str} => {
  const ${charPtr} = new swab.__WasmPointer(
    swab.__wasm_exports.malloc(${str}.length + 1),
    ${c2js(env, ctype.to)},
    ${js2c(env, ctype.to)},
    1,
    'i8'
  );
  for (let ${idx} = 0; ${idx} < ${str}.length; ${idx}++) {
    ${charPtr}.offset(${idx}).assign(${str}[${idx}]);
  }
  // Make sure we write a null terminator & don't try to call a method on 0
  ${charPtr}.offset(${str}.length).assign(String.fromCharCode(0));

  return ${charPtr}.addr;
})
`
      default:
        const ptr = gensym('pointer')
        return `(${ptr} => ${ptr}.addr)`
      }
    case 'array':
      const copy = getCopy(env, ctype)
      env.exports.add('malloc')
      env.exports.add('free')
      env.exports.add(copy)

      const arr = gensym('array'), arrPtr = gensym('arrayPointer'), idx = gensym('index')

      return `
(${arr} => {
  const ${arrPtr} = new swab.__WasmPointer(
    swab.__wasm_exports.malloc(${arr}.length),
    ${c2js(env, ctype.of)},
    ${js2c(env, ctype.of)},
    ${getSizeof(env, ctype.of)}(),
    '${c2pointer_type(ctype.of)}'
  );
  for (let ${idx} = 0; ${idx} < ${arr}.length; ${idx}++) {
    swab.__wasm_exports.${copy}(${arrPtr}.offset(${idx}).addr, ${arr}[${idx}]);
  }

  return ${arrPtr}.addr;
})
`
      break
    case 'functionPointer':
      /* Multi-step process:
       * - Figure out what the equivalent JS types are
       * - Setup code to perform the C->JS conversions for args + JS->C for return value
       * - Do the conversion into a JS function
       */
      const paramtypes = ctype.takes
      const returntype = ctype.returns

      const cparams = paramtypes.map(ctype => c2js(env, ctype))
      const creturn = js2c(env, returntype)

      const fp = gensym('functionPointer'), result = gensym('result'), fpId = gensym('fpId')
      const paramNames = paramtypes.map(_ => gensym('param'))

      const castparams = paramNames.map((name, idx) => `${cparams[idx]}(${name})`)

      const wrapperId = cacheWrapper(env, paramtypes, returntype)

      // TODO: If it returns void don't do anything with the result value
      // TODO: Can we statically perform the function wrapping? Everything but the inner function is known statically.
      // WARN: __wasm_table_free() is a bad idea because some libraries (e.g. brotli) hold onto function pointers in internal state
      return `
(${fp} => {
  const ${fpId} = swab.__wasm_table_alloc();
  swab.__wasm_table.set(
    ${fpId},
    swab.__wasm_wrap_function(
      (${paramNames}) => {
        const ${result} =
          ${creturn}(${fp}(${castparams}))
        //swab.__wasm_table_free(${fpId})
        return ${result}
      },
      '${wrapperId}'
    )
  );
  return ${fpId};
})`
    case 'enum':
      const name = gensym('enum')
      return `(${name} => (${JSON.stringify(ctype.values)}[${name}]))`
    case 'struct':
    case 'union':
      // QUESTION: Maybe we should just write to a pointer? Or else create a copy?
      // A wrapper function for the & operator would help a lot if copying
      // NOTE: We write every union field here: always works. We could write just one, but it would have to be the largest
      const obj = gensym('object')

      let params = []
      for (let field in ctype.fields) {
        params.push(`${field}: ${obj}.get_${field}()`)
      }
      return `(${obj} => ${getConstructor(env, ctype)}({${params.join(',')}}))`
    case 'void':
      return id
    default:
      return id
  }
}
