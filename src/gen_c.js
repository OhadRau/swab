import { gensym } from './env.js'
import { ctypes } from './types.js'

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

  // If we substituted the type already, go with the unsubstituted version
  if (type.orig) {
    return type2ctype(type.orig, buffer);
  }
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
      for (let key in type.params) {
        structFields += type2cdecl(type.params[key], key) + ';'
      }
      return `struct { ${structFields} } ${buffer}`
    case 'union':
      const unionFields = ''
      for (let key in type.params) {
        unionFields += type2cdecl(type.params[key], key) + ';'
      }
      return `union { ${unionFields} } ${buffer}`
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

export function wrapAccessors(env, type) {
  const isI64 = t => t.type === 'i64' || t.type === 'u64'
  const accessorName = (obj, field) => {
    const unsubbed = obj.orig || obj;
    if (!(unsubbed.type in ctypes)) {
      // If the name is like `struct t` we want to only take the `t`
      const components = unsubbed.type.split(/\s+/g)
      const name = components[components.length - 1]
      return [`${name}_get_${field}`, `${name}_set_${field}`]
    } else {
      return [`get_${field}`, `set_${field}`]
    }
  }
  switch (type.type) {
    case 'pointer':
      env.accessorTable[JSON.stringify(type)] = wrapAccessors(env, type.params[0])
    case 'struct':
    case 'union':
      let accessors = {}
      for (let field in type.params) {
        // Check if the field is i64, if so wrap the i64 access
        if (isI64(type.params[field])) {
          const fieldType = { type: '__wasm_big_int', params: [] }
          const ptrType = { type: 'pointer', params: [type] }

	  const [getterName, setterName] = accessorName(type, field)
          const getter = gensym(getterName), setter = gensym(setterName)

          const obj = gensym('object'), value = gensym('value')
          env.cBuffer += `
${type2cFnDecl(getter, [ptrType], [obj], fieldType)} {
  int64_t ${value} = ${obj}->${field};
  return __js_new_big_int(${value} >> 32, ${value} & 0xFFFFFFFF);
}

${type2cFnDecl(setter, [ptrType, fieldType], [obj, value], { type: 'void', params: [] })} {
  ${obj}->${field}  = __js_big_int_upper(${value}) << 32;
  ${obj}->${field} |= __js_big_int_lower(${value});
}
`
          accessors[field] = { getter, setter }
        } else {
          const ptrType = { type: 'pointer', params: [type] }

	  const [getterName, setterName] = accessorName(type, field)
          const getter = gensym(getterName), setter = gensym(setterName)

          const obj = gensym('object'), value = gensym('value')
          // TODO: Make this code work properly if we're dealing with a value that needs to be copied
          env.cBuffer += `
${type2cFnDecl(getter, [ptrType], [obj], type.params[field])} {
  return ${obj}->${field};
}

${type2cFnDecl(setter, [ptrType, type.params[field]], [obj, value], { type: 'void', params: [] })} {
  ${obj}->${field} = ${value};
}
`
          accessors[field] = { getter, setter }
        }
      }

      env.accessorTable[JSON.stringify(type)] = accessors
      return accessors
    default:
      throw `Can't generate accesors for type ${type2ctype(type)}`
  }
}

export function wrapSizeof(env, type) {
  const wrapper = gensym('sizeof')
  env.sizeofTable[JSON.stringify(type)] = wrapper

  env.cBuffer += `
size_t ${wrapper}() {
  return sizeof(${type2ctype(type)});
}
`
  return wrapper
}

export function wrapI64Fn(env, fn, argTypes, retType) {
  env.imports.add("__js_new_big_int")
  env.imports.add("__js_big_int_upper")
  env.imports.add("__js_big_int_lower")

  // TODO: What do we do for function pointers?
  const wrapper = gensym('i64_wrapper')
  env.i64Table[fn] = wrapper

  const retype = oldType =>
    oldType.type === 'i64' || oldType.type === 'u64'
      ? { type: '__wasm_big_int', params: [] }
      : oldType

  const actualReturnType = retype(retType)
  const actualArgNames = argTypes.map(_ => gensym('param'))
  const actualArgTypes = argTypes.map(oldType => retype(oldType))

  const wrapReturn =
    retType.type === 'i64' || retType.type === 'u64'
  const wrapArg = index =>
    argTypes[index].type === 'i64' || argTypes[index].type === 'u64'

  const wrappedArgs = actualArgNames.map((name, index) =>
    wrapArg(index)
      ? `__wasm_wrap_i64(${name})`
      : name
  )

  const wrappedCall =
    wrapReturn
      ? `__wasm_wrap_i64(${fn}(${wrappedArgs.join(',')}))`
      : `${fn}(${wrappedArgs.join(',')})`

  env.cBuffer += `
${type2cFnDecl(wrapper, actualArgTypes, actualArgNames, actualReturnType)} {
  return ${wrappedCall};
}
`

  return wrapper
}
