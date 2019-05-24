import { gensym } from './env.js'
import { ctypes, getDestructor } from './types.js'

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

// QUESTION: Should these take parameters or return uninitialized data?
// FWIW Uninitialized makes MUCH more sense for unions
export function wrapConstructorDestructor(env, type) {
  const isI64 = t => t.type === 'i64' || t.type === 'u64'
  const constructorDestructorName = (obj, field) => {
    const unsubbed = obj.orig || obj;
    if (!(unsubbed.type in ctypes)) {
      // If the name is like `struct t` we want to only take the `t`
      const components = unsubbed.type.split(/\s+/g)
      const name = components[components.length - 1]
      return [`create_${name}`, `delete_${name}`]
    } else {
      return [`create`, `delete`]
    }
  }

  const key = JSON.stringify(type)

  const [constructorName, destructorName] =
        type.type === 'pointer' ? constructorDestructorName(type.params[0]) : constructorDestructorName(type)

  const constructor = gensym(constructorName), destructor = gensym(destructorName)

  const obj = gensym('object')

  switch (type.type) {
    case 'pointer':
      const subtype = type.params[0]

      switch (subtype.type) {
      case 'struct':
        const freeFields = []
        for (let field in subtype.params) {
          const fieldType = subtype.params[field];
          if (fieldType.type === 'pointer') {
            freeFields.push(`if (${obj}->${field}) ${getDestructor(env, fieldType)}(${obj}->${field})`)
          }
        }

        env.cBuffer += `
${type2cFnDecl(constructor, [], [], type)} {
  return (${type2ctype(type)}) malloc(sizeof(${type2ctype(type)}));
}

${type2cFnDecl(destructor, [type], [obj], { type: 'void' })} {
  // If struct, free all the fields that are pointers
  ${freeFields.join(';\n')}
  free(${obj});
}
`
        env.constructorTable[key] = constructor
        env.destructorTable[key] = destructor
        return [constructor, destructor]
      case 'union':
        /* Unions are tricky, because think of the type:
         *   union { int *m; char *q; } *p;
         * The destructor only has to free one of the pointers here.
         * This seems easy enough, but now think of a nested version:
         *   union { int *m; struct { char *q; int c; } *g; } *p;
         * Do we free twice? Or what if we have:
         *   union { int *m; int c } *p;
         * Do we even free at all? Because of how tricky this is, I
         * think the safest solution is to fall through to the default
         * case and just free the pointer. This should be well-documented
         * and emit some kind of warning. */
        console.warn(`
Unions destructors cannot be generated to deal with all cases.
Do not rely on '${destructor}' to free anything other than the union pointer.
`)
      default:
        env.cBuffer += `
${type2cFnDecl(constructor, [], [], type)} {
  return (${type2ctype(type)}) malloc(sizeof(${type2ctype(type)}));
}

${type2cFnDecl(destructor, [type], [obj], { type: 'void' })} {
  free(${obj});
}
`
        env.constructorTable[key] = constructor
        env.destructorTable[key] = destructor
        return [constructor, destructor]
      }
  case 'struct':
    const freeFields = []
    for (let field in type.params) {
      const fieldType = type.params[field];
      if (fieldType.type === 'pointer') {
        freeFields.push(`if (${obj}->${field}) ${getDestructor(env, fieldType)}(${obj}->${field})`)
      }
    }

        env.cBuffer += `
${type2cFnDecl(constructor, [], [], type)} {
  return (${type2ctype(type)}) {};
}

${type2cFnDecl(destructor, [type], [obj], { type: 'void' })} {
  // If struct, free all the fields that are pointers
  ${freeFields.join(';\n')}
}
`
    env.constructorTable[key] = constructor
    env.destructorTable[key] = destructor
    return [constructor, destructor]
  case 'union':
    env.cBuffer += `
${type2cFnDecl(constructor, [], [], type)} {
  return (${type2ctype(type)}) {};
}
`
    console.warn(`A destructor for ${type2ctype(type)} could not be generated.`)
    env.constructorTable[key] = constructor
    return [constructor]
  default:
    throw `Can't generate constructor/destructor for type ${type2ctype(type)}`
  }
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
  /* Code generation here is dependent on whether this is a struct/union value
   * or a struct/union pointer. Pointers will enable the user of setters and
   * require a dereference operation to access the fields. As a result, we just
   * handle these as two separate cases (despite the fact that they're almost
   * identical apart from those two differences). TODO: Cleanup? */
  switch (type.type) {
    case 'pointer':
      const subtype = type.params[0]
      switch (subtype.type) {
      case 'struct':
      case 'union':
        // Wrap the accessors for a reference type
        let accessors = {}
        for (let field in subtype.params) {
          // Check if the field is i64, if so wrap the i64 access
          if (isI64(subtype.params[field])) {
            const fieldType = { type: '__wasm_big_int', params: [] }
            const ptrType = { type: 'pointer', params: [subtype] }

            const [getterName, setterName] = accessorName(subtype, field)
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
            const ptrType = { type: 'pointer', params: [subtype] }

            const [getterName, setterName] = accessorName(subtype, field)
            const getter = gensym(getterName), setter = gensym(setterName)

            const obj = gensym('object'), value = gensym('value')
            // TODO: Make this code work properly if we're dealing with a value that needs to be copied
            env.cBuffer += `
${type2cFnDecl(getter, [ptrType], [obj], subtype.params[field])} {
  return ${obj}->${field};
}

${type2cFnDecl(setter, [ptrType, subtype.params[field]], [obj, value], { type: 'void', params: [] })} {
  ${obj}->${field} = ${value};
}
`
            accessors[field] = { getter, setter }
          }
        }

        env.accessorTable[JSON.stringify(type)] = accessors
        return accessors
      default:
        throw `Can't generate accessors for type ${type2ctype(type)}`
      }
    case 'struct':
    case 'union':
      // Wrap the accessors for a value type
      let accessors = {}
      for (let field in type.params) {
        // Check if the field is i64, if so wrap the i64 access
        if (isI64(type.params[field])) {
          const fieldType = { type: '__wasm_big_int', params: [] }

          const [getterName] = accessorName(type, field)
          const getter = gensym(getterName)

          const obj = gensym('object')
          env.cBuffer += `
${type2cFnDecl(getter, [type], [obj], fieldType)} {
  int64_t ${value} = ${obj}.${field};
  return __js_new_big_int(${value} >> 32, ${value} & 0xFFFFFFFF);
}
`
          accessors[field] = { getter }
        } else {
          const [getterName] = accessorName(type, field)
          const getter = gensym(getterName)

          const obj = gensym('object')
          env.cBuffer += `
${type2cFnDecl(getter, [type], [obj], type.params[field])} {
  return ${obj}.${field};
}
`
          accessors[field] = { getter }
        }
      }

      env.accessorTable[JSON.stringify(type)] = accessors
      return accessors
    default:
      throw `Can't generate accessors for type ${type2ctype(type)}`
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
