import { gensym, Env, id } from './env.js'
import { wrapSizeof, wrapAccessors, wrapConstructorDestructor, wrapCopy } from './gen_c.js'
import { c2js, js2c } from './gen_js.js';

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
