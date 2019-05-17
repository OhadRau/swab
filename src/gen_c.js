import { gensym } from './env.js'

// Pretty-print types to an abstract declarator
// http://c0x.coding-guidelines.com/6.7.6.html (yeah, idk either)
// see also: https://www.cs.dartmouth.edu/~mckeeman/cs48/references/c.html
// see also x2: https://cdecl.org/
// Basically, abstract declarators can't really be represented recursively I think :/
export function type2ctype(type, buffer = '') {
  /* This buffer is really important to this function working. We have to utilize
   * tail-recursion to do the recursion top-down. Why? The way that C declarators
   * work is that the as we descend into the type tree, the new type information
   * surrounds the highest-level type. E.g. In the type `int *[3]`, the first thing
   * that should be read is the `*`, then the `[3]`, and finally the `int`. This
   * buffer allows us to append to both sides of the string as we descend the type
   * tree.
   */
  // Make sure to #include <stdbool.h> & #include <stdint.h>
  switch (type.type) {
    case 'bool':
      return `bool ${buffer}`
    case 'char':
      return `char ${buffer}`
    case 'u8':
      return `uint8_t ${buffer}`
    case 'i8':
      return `int8_t ${buffer}`
    case 'u16':
      return `uint16_t ${buffer}`
    case 'i16':
      return `int16_t ${buffer}`
    case 'u32':
      return `uint32_t ${buffer}`
    case 'i32':
      return `int32_t ${buffer}`
    case 'u64':
      return `uint64_t ${buffer}`
    case 'i64':
      return `int64_t ${buffer}`
    case 'f32':
      return `float ${buffer}`
    case 'f64':
      return `double ${buffer}`
    case 'pointer':
      return type2ctype(type.params[0], `*${buffer}`)
    case 'array':
      // Make sure not to generate empty parens (parse error)
      if (buffer !== '') {
        return type2ctype(type.params[0], `(${buffer})[${type.params[1]}]`)
      } else {
        return type2ctype(type.params[0], `[${type.params[1]}]`)
      }
    case 'functionPointer':
      // WARN: Map passes indices. Don't want to interpret that as buffer
      const argTypes = type.params[0].map((type, _) => type2ctype(type))
      return type2ctype(type.params[1], `(*${buffer})(${argTypes.join(',')})`)
    case 'enum':
      let enumFields = type.params
      return `enum { ${enumFields.join(',')} } ${buffer}`
    case 'struct':
      let structFields = ''
      for (key in type.params) {
        structFields += type2cdecl(type.params[key], key)
      }
      return `struct { ${structFields.join(';')} } ${buffer}`
    case 'union':
      const unionFields = ''
      for (key in type.params) {
        unionFields += type2cdecl(type.params[key], key)
      }
      return `union { ${unionFields.join(';')} } ${buffer}`
    case 'void':
      return `void ${buffer}`
    default: // Unknown type
      return `${type.type} ${buffer}`
  }
}

// Like type2ctype, but for concrete declarators
export function type2cdecl(type, name) {
  return type2ctype(type, name)
}

// Like type2cdecl, but for function headers
export function type2cFnDecl(name, argTypes, argNames, retType) {
  const argDecls = argTypes.map((type, index) => type2cdecl(type, argNames[index]))
  return type2cdecl(retType, `${name}(${argDecls.join(',')})`)
}

export function wrapSizeof(env, type) {
  const wrapper = gensym()
  env.sizeofTable[type] = wrapper

  return (
`
size_t ${wrapper}() {
  return sizeof(${type2ctype(type)});
}
`)

}

export function wrapI64Fn(env, fn, argTypes, retType) {
  // TODO: What do we do for function pointers?
  const wrapper = gensym()
  env.i64Table[fn] = wrapper

  const retype = oldType =>
    oldType.type == 'i64' || oldType.type == 'u64'
      ? env.bigIntType
      : oldType

  const actualReturnType = retype(retType)
  const actualArgNames = argTypes.map(_ => gensym())
  const actualArgTypes = argTypes.map(oldType => retype(oldType))

  const wrapReturn =
    retType.type == 'i64' || retType.type == 'u64'
  const wrapArg = index =>
    argTypes[index].type == 'i64' || argTypes[index].type == 'u64'

  const wrappedArgs = actualArgNames.map((name, index) =>
    wrapArg(index)
      ? `${env.wrapI64Name}(${name})`
      : name
  )

  const wrappedCall =
    wrapReturn
      ? `${env.wrapI64Name}(${fn}(${wrappedArgs.join(',')}))`
      : `${fn}(${wrappedArgs.join(',')})`

  return (
`
${type2cFnDecl(wrapper, actualArgTypes, actualArgNames, actualReturnType)} {
  return ${wrappedCall}
}
`)
}
