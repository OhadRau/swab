import * as fs from 'fs'

export let __wasm_imports = {}
export let __wasm_memory = null
export let __wasm_exports = null
export let __wasm_table = null

export function __js_new_big_int(upper, lower) {
  return (BigInt(upper) << 32n) | BigInt(lower)
}
__wasm_imports.__js_new_big_int = __js_new_big_int

export function __js_big_int_upper(bigint) {
  return Number(bigint >> 32n)
}
__wasm_imports.__js_big_int_upper = __js_big_int_upper

export function __js_big_int_lower(bigint) {
  return Number(bigint & 0xFFFFFFFFn)
}
__wasm_imports.__js_big_int_lower = __js_big_int_lower

export let __wasm_wrapped_functions = {}

export function __wasm_wrap_function(fn, wrapper_id) {
  /* wrapper_id refers to the entry in the table of WASM
   * functions wrappers for this type. e.g. an i32->i32
   * function just gets dumped into the table and (using
   * memoization) we can reuse that same function for all
   * compatible callbacks. This means less compilation of
   * WASM functions.
   */
  const wrapper = __wasm_wrapped_functions[wrapper_id]
  // TODO: Is there a better way than this?
  let instance = new WebAssembly.Instance(wrapper, {
    e: { f: fn }
  })
  return instance.exports.f
}

export class __WasmPointer {
  /* QUESTION: Maybe instead of taking `convert` we should
   * take the type? Or both? What are the pros & cons?
   */
  constructor(addr, convert2js, convert2c, size, type) {
    this.addr = addr;
    this.convert2js = convert2js;
    this.convert2c = convert2c;
    this.size = size;
    this.type = type;
  }

  deref() {
    // FIXME: Make sure that we don't try to convert signded-ness twice(!!!)
    switch (this.type) {
      case 'i8':
        return convert2js(new Int8Array(__wasm_memory.buffer)[this.addr])
      case 'i16':
        return convert2js(new Int16Array(__wasm_memory.buffer)[this.addr / 2])
      case 'i32':
        return convert2js(new Int32Array(__wasm_memory.buffer)[this.addr / 4])
      case 'i64':
        return convert2js(new BigInt64Array(__wasm_memory.buffer)[this.addr / 8])
      case 'u8':
        return convert2js(new Uint8Array(__wasm_memory.buffer)[this.addr])
      case 'u16':
        return convert2js(new Uint16Array(__wasm_memory.buffer)[this.addr / 2])
      case 'u32':
        return convert2js(new Uint32Array(__wasm_memory.buffer)[this.addr / 4])
      case 'u64':
        return convert2js(new BigUint64Array(__wasm_memory.buffer)[this.addr / 8])
      case 'f32':
        return convert2js(new Float32Array(__wasm_memory.buffer)[this.addr / 4])
      case 'f64':
        return convert2js(new Float64Array(__wasm_memory.buffer)[this.addr / 8])
      default:
        return convert2js(this.addr)
    }
  }

  assign(val) {
    // FIXME: Make sure that we don't try to convert signded-ness twice(!!!)
    switch (this.type) {
      case 'i8':
        new Int8Array(__wasm_memory.buffer)[this.addr] = convert2c(val)
      case 'i16':
        new Int16Array(__wasm_memory.buffer)[this.addr / 2] = convert2c(val)
      case 'i32':
        new Int32Array(__wasm_memory.buffer)[this.addr / 4] = convert2c(val)
      case 'i64':
        new BigInt64Array(__wasm_memory.buffer)[this.addr / 8] = convert2c(val)
      case 'u8':
        new Uint8Array(__wasm_memory.buffer)[this.addr] = convert2c(val)
      case 'u16':
        new Uint16Array(__wasm_memory.buffer)[this.addr / 2] = convert2c(val)
      case 'u32':
        new Uint32Array(__wasm_memory.buffer)[this.addr / 4] = convert2c(val)
      case 'u64':
        new BigUint64Array(__wasm_memory.buffer)[this.addr / 8] = convert2c(val)
      case 'f32':
        new Float32Array(__wasm_memory.buffer)[this.addr / 4] = convert2c(val)
      case 'f64':
        new Float64Array(__wasm_memory.buffer)[this.addr / 8] = convert2c(val)
      default:
        // This isn't perfect but whatever
        convert2c(this.addr)
    }
  }

  offset(n) {
    return new __WasmPointer(this.addr + n * this.size, this.convert, this.size)
  }

  free() {
    __wasm_exports.free(this.addr)
  }
}

// Are JS Sets O(n) insert/delete? Why not do a HashSet?
let __wasm_table_free_blocks = new Set()

// Allocate cell in the table
export function __wasm_table_alloc() {
  if (__wasm_table_free_blocks.size == 0) {
    // Grow the table (double size)
    const old_end = __wasm_table.length
    __wasm_table.grow(__wasm_table.length)
    // Add the new blocks to the table
    for (let i = old_end; i < __wasm_table.length; i++) {
      __wasm_table_free_blocks.add(i)
    }
  }
  let id = __wasm_table_free_blocks.values().next().value
  __wasm_table_free_blocks.delete(id)
  return id
}

export function __wasm_table_free(id) {
  __wasm_table_free_blocks += id
}

// Is this the correct place for this function?
export async function __wasm_load(wasmFile) {
  __wasm_table = new WebAssembly.Table({
    element: 'anyfunc',
    initial: 1
  })

  // Initialize all table blocks to free
  for (let i = 0; i < __wasm_table.length; i++) {
    __wasm_table_free_blocks.add(i)
  }

  __wasm_imports.memory = new WebAssembly.Memory({initial: 32})
  __wasm_memory = new Uint8Array(__wasm_imports.memory.buffer)
  __wasm_imports.__indirect_function_table = __wasm_table

  const binary = fs.readFileSync(wasmFile)
  let program = await WebAssembly.instantiate(binary, {env: __wasm_imports})
  let instance = program.instance

  __wasm_exports = instance.exports

  // Anything to return?
}
