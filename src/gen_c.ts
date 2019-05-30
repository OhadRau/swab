import { gensym, Env } from './env'
import { getDestructor, CType } from './types'

// Pretty-print types to an abstract declarator
// http://c0x.coding-guidelines.com/6.7.6.html (yeah, idk either)
// see also: https://www.cs.dartmouth.edu/~mckeeman/cs48/references/c.html
// see also x2: https://cdecl.org/
// Basically, abstract declarators can't really be represented recursively I think :/
export function formatCType(ctype: CType, buffer: string = ''): string {
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
  if (ctype.orig) {
    return formatCType(ctype.orig, buffer);
  }
  switch (ctype.kind) {
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
      return formatCType(ctype.to, `*${buffer}`)
    case 'array':
      // Make sure not to generate empty parens (parse error)
      if (buffer !== '') {
        return formatCType(ctype.of, `(${buffer})[${ctype.length}]`)
      } else {
        return formatCType(ctype.of, `[${ctype.length}]`)
      }
    case 'functionPointer':
      // WARN: Map passes indices. Don't want to interpret that as buffer, so don't .map(formatCType)
      const argTypes = ctype.takes.map((ty: CType) => formatCType(ty))
      return formatCType(ctype.returns, `(*${buffer})(${argTypes.join(',')})`)
    case 'enum':
      let enumFields = ctype.values
      return `enum { ${enumFields.join(',')} } ${buffer}`
    case 'struct':
      let structFields = ''
      for (let key in ctype.fields) {
        structFields += formatCDecl(ctype.fields[key], key) + ';'
      }
      return `struct { ${structFields} } ${buffer}`
    case 'union':
      let unionFields = ''
      for (let key in ctype.fields) {
        unionFields += formatCDecl(ctype.fields[key], key) + ';'
      }
      return `union { ${unionFields} } ${buffer}`
    case 'void':
      return `void ${buffer}`
    case 'user': // Unknown type
      return `${ctype.name} ${buffer}`
  }
}

// Like type2ctype, but for concrete declarators
export function formatCDecl(ctype: CType, name: string): string {
  return formatCType(ctype, name)
}

// Like type2cdecl, but for function headers
export function formatFunctionDecl(name: string, args: { [name: string]: CType }, retType: CType) {
  const argDecls = Object.entries(args).map(([name, ctype]: [string, CType]) => formatCDecl(ctype, name))
  return formatCDecl(retType, `${name}(${argDecls.join(',')})`)
}

export function wrapCopy(env: Env, ctype: CType) {
  const key = JSON.stringify(ctype)

  const copyName = (obj: CType) => {
    const unsubbed = obj.orig || obj;
    if (unsubbed.kind === 'user') {
      // If the name is like `struct t` we want to only take the `t`
      const components = unsubbed.name.split(/\s+/g)
      const name = components[components.length - 1]
      return `copy_${name}`
    } else {
      return `copy`
    }
  }

  const copy = gensym(copyName(ctype)), src = gensym('src'), dst = gensym('dest')

  const ptrType: CType = { kind: 'pointer', to: ctype }

  env.cBuffer += `
${formatFunctionDecl(copy, { [dst]: ptrType, [src]: ctype }, { kind: 'void' })} {
  memcpy(${dst}, &${src}, sizeof(${formatCType(ctype)}));
}
`
  env.copyTable[key] = copy
  env.exports.add(copy)
  return copy
}

// QUESTION: Should these take parameters or return uninitialized data?
// FWIW Uninitialized makes MUCH more sense for unions
export function wrapConstructorDestructor(env: Env, ctype: CType) {
  const isI64 = (t: CType) => t.kind === 'i64' || t.kind === 'u64'
  const constructorDestructorName = (obj: CType) => {
    const unsubbed = obj.orig || obj
    if (unsubbed.kind === 'user') {
      // If the name is like `struct t` we want to only take the `t`
      const components = unsubbed.kind.split(/\s+/g)
      const name = components[components.length - 1]
      return [`create_${name}`, `delete_${name}`]
    } else {
      return [`create`, `delete`]
    }
  }

  const key = JSON.stringify(ctype)

  const [constructorName, destructorName] =
    ctype.kind === 'pointer'
      ? constructorDestructorName(ctype.to)
      : constructorDestructorName(ctype)

  const constructor = gensym(constructorName), destructor = gensym(destructorName)

  const obj = gensym('object')

  switch (ctype.kind) {
    case 'pointer':
      const subtype = ctype.to

      switch (subtype.kind) {
      case 'struct':
        const freeFields = []
        for (let field in subtype.fields) {
          const fieldType = subtype.fields[field]
          if (fieldType.kind === 'pointer') {
            freeFields.push(`if (${obj}->${field}) ${getDestructor(env, fieldType)}(${obj}->${field});`)
          }
        }

        env.cBuffer += `
${formatFunctionDecl(constructor, {}, ctype)} {
  return (${formatCType(ctype)}) malloc(sizeof(${formatCType(ctype)}));
}

${formatFunctionDecl(destructor, { [obj]: ctype }, { kind: 'void' })} {
  // If struct, free all the fields that are pointers
  ${freeFields.join('\n  ')}
  free(${obj});
}
`
        env.constructorTable[key] = constructor
        env.destructorTable[key] = destructor
        env.exports.add(constructor)
        env.exports.add(destructor)
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
${formatFunctionDecl(constructor, {}, ctype)} {
  return (${formatCType(ctype)}) malloc(sizeof(${formatCType(ctype)}));
}

${formatFunctionDecl(destructor, { [obj]: ctype }, { kind: 'void' })} {
  free(${obj});
}
`
        env.constructorTable[key] = constructor
        env.destructorTable[key] = destructor
        env.exports.add(constructor)
        env.exports.add(destructor)
        return [constructor, destructor]
      }
  case 'struct':
    let structArgs: { [key: string]: CType } = {}, assignments = []
    const freeFields = []
    for (let field in ctype.fields) {
      const name = gensym(field)
      const fieldType = ctype.fields[field]
      
      structArgs[name] = fieldType

      assignments.push(`.${field} = ${name}`)

      if (fieldType.kind === 'pointer') {
        freeFields.push(`if (${obj}.${field}) ${getDestructor(env, fieldType)}(${obj}.${field});`)
      }
    }

    env.cBuffer += `
${formatFunctionDecl(constructor, structArgs, ctype)} {
  return (${formatCType(ctype)}) { ${assignments.join(',')} };
}

${formatFunctionDecl(destructor, { [obj]: ctype }, { kind: 'void' })} {
  // If struct, free all the fields that are pointers
  ${freeFields.join('\n  ')}
}
`
    env.constructorTable[key] = constructor
    env.destructorTable[key] = destructor
    env.exports.add(constructor)
    env.exports.add(destructor)
    return [constructor, destructor]
  case 'union':
    const tag = gensym('tag'), union = gensym('union')
    let unionArgs: { [key: string]: CType } = { [tag]: { kind: 'i32' } }, uassignments = []
    for (let field in ctype.fields) {
      const name = gensym(field)
      const fieldType = ctype.fields[field]
      unionArgs[name] = fieldType

      uassignments.push(`
  case ${Object.keys(ctype.fields).indexOf(field)}:
    ${union}.${field} = ${name};
    break;`)
    }

    env.cBuffer += `
${formatFunctionDecl(constructor, unionArgs, ctype)} {
  ${formatCType(ctype)} ${union};
  switch (${tag}) {
  ${uassignments.join('')}
  };
  return ${union};
}
`
    console.warn(`A destructor for ${formatCType(ctype)} could not be generated.`)
    env.constructorTable[key] = constructor
    env.exports.add(constructor)
    return [constructor]
  default:
    throw `Can't generate constructor/destructor for type ${formatCType(ctype)}`
  }
}

export function wrapAccessors(env: Env, ctype: CType): { [key: string]: { getter?: string, setter?: string } } {
  const isI64 = (t: CType) => t.kind === 'i64' || t.kind === 'u64'
  const accessorName = (obj: CType, field: string) => {
    const unsubbed = obj.orig || obj;
    if (unsubbed.kind === 'user') {
      // If the name is like `struct t` we want to only take the `t`
      const components = unsubbed.kind.split(/\s+/g)
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
  switch (ctype.kind) {
    case 'pointer':
      const subtype = ctype.to
      switch (subtype.kind) {
      case 'struct':
      case 'union':
        // Wrap the accessors for a reference type
        let accessors: { [key: string]: { getter?: string, setter?: string } } = {}
        for (let field in subtype.fields) {
          // Check if the field is i64, if so wrap the i64 access
          if (isI64(subtype.fields[field])) {
            const fieldType: CType = { kind: 'user', name: '__wasm_big_int' }
            const ptrType: CType = { kind: 'pointer', to: subtype }

            const [getterName, setterName] = accessorName(subtype, field)
            const getter = gensym(getterName), setter = gensym(setterName)

            const obj = gensym('object'), value = gensym('value')
            env.cBuffer += `
${formatFunctionDecl(getter, { [obj]: ptrType }, fieldType)} {
  int64_t ${value} = ${obj}->${field};
  return __js_new_big_int(${value} >> 32, ${value} & 0xFFFFFFFF);
}

${formatFunctionDecl(setter, { [obj]: ptrType, [value]: fieldType }, { kind: 'void' })} {
  ${obj}->${field}  = __js_big_int_upper(${value}) << 32;
  ${obj}->${field} |= __js_big_int_lower(${value});
}
`
            accessors[field] = { getter, setter }
          } else {
            const ptrType: CType = { kind: 'pointer', to: subtype }

            const [getterName, setterName] = accessorName(subtype, field)
            const getter = gensym(getterName), setter = gensym(setterName)

            const obj = gensym('object'), value = gensym('value')
            // TODO: Make this code work properly if we're dealing with a value that needs to be copied
            env.cBuffer += `
${formatFunctionDecl(getter, { [obj]: ptrType }, subtype.fields[field])} {
  return ${obj}->${field};
}

${formatFunctionDecl(setter, { [obj]: ptrType, [value]: subtype.fields[field] }, { kind: 'void' })} {
  ${obj}->${field} = ${value};
}
`
            accessors[field] = { getter, setter }
          }
        }

        env.accessorTable[JSON.stringify(ctype)] = accessors
        return accessors
      default:
        throw `Can't generate accessors for type ${formatCType(ctype)}`
      }
    case 'struct':
    case 'union':
      // Wrap the accessors for a value type
      let accessors: { [key: string]: { getter?: string, setter?: string } } = {}
      for (let field in ctype.fields) {
        // Check if the field is i64, if so wrap the i64 access
        if (isI64(ctype.fields[field])) {
          const fieldType: CType = { kind: 'user', name: '__wasm_big_int' }

          const [getterName] = accessorName(ctype, field)
          const getter = gensym(getterName)

          const obj = gensym('object'), value = gensym('value')
          env.cBuffer += `
${formatFunctionDecl(getter, { [obj]: ctype }, fieldType)} {
  int64_t ${value} = ${obj}.${field};
  return __js_new_big_int(${value} >> 32, ${value} & 0xFFFFFFFF);
}
`
          accessors[field] = { getter }
        } else {
          const [getterName] = accessorName(ctype, field)
          const getter = gensym(getterName)

          const obj = gensym('object')
          env.cBuffer += `
${formatFunctionDecl(getter, { [obj]: ctype }, ctype.fields[field])} {
  return ${obj}.${field};
}
`
          accessors[field] = { getter }
        }
      }

      env.accessorTable[JSON.stringify(ctype)] = accessors
      return accessors
    default:
      throw `Can't generate accessors for type ${formatCType(ctype)}`
  }
}

export function wrapSizeof(env: Env, type: CType): string {
  const wrapper = gensym('sizeof')
  env.sizeofTable[JSON.stringify(type)] = wrapper

  env.cBuffer += `
size_t ${wrapper}() {
  return sizeof(${formatCType(type)});
}
`
  return wrapper
}

export function wrapI64Fn(env: Env, fn: string, argTypes: CType[], retType: CType) {
  env.imports.add("__js_new_big_int")
  env.imports.add("__js_big_int_upper")
  env.imports.add("__js_big_int_lower")

  // TODO: What do we do for function pointers?
  const wrapper = gensym('i64_wrapper')
  env.i64Table[fn] = wrapper
  env.exports.add(wrapper)

  const retype = (oldType: CType): CType =>
    oldType.kind === 'i64' || oldType.kind === 'u64'
      ? { kind: 'user', name: '__wasm_big_int' }
      : oldType

  const actualReturnType = retype(retType)
  const actualArgNames = argTypes.map(_ => gensym('param'))
  const actualArgTypes = argTypes.map(oldType => retype(oldType))

  const wrapReturn =
    retType.kind === 'i64' || retType.kind === 'u64'
  const wrapArg = (index: number) =>
    argTypes[index].kind === 'i64' || argTypes[index].kind === 'u64'

  const wrappedArgs = actualArgNames.map((name, index) =>
    wrapArg(index)
      ? `__wasm_unwrap_i64(${name})`
      : name
  )

  const wrappedCall =
    wrapReturn
      ? `__wasm_wrap_i64(${fn}(${wrappedArgs.join(',')}))`
      : `${fn}(${wrappedArgs.join(',')})`

  let args: { [key: string]: CType } = {}
  actualArgNames.map((name, index) => args[name] = actualArgTypes[index])

  env.cBuffer += `
${formatFunctionDecl(wrapper, args, actualReturnType)} {
  return ${wrappedCall};
}
`

  return wrapper
}
