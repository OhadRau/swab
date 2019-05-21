export function __js_new_big_int(upper, lower) {
  return (BigInt(upper) * (2n ** 32n)) + BigInt(lower)
}

let __wasm_wrapped_functions = {}

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

export class __WasmPointer() {
  /* QUESTION: Maybe instead of taking `convert` we should
   * take the type? Or both? What are the pros & cons?
   */
  constructor(addr, convert, size) {
    this.addr = addr;
    this.convert = convert;
    this.size = size;
  }

  deref() {
    return __wasm_memory.slice(this.addr, this.addr + this.size)
  }

  derefAndConvert() {
    return this.convert(this.deref(), this.addr)
  }

  offset(n) {
    return new __WasmPointer(this.addr + n * this.size, this.convert, this.size)
  }

  // TODO: Should we add a free method?
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

let __wasm_imports = {}
let __wasm_memory = null
let __wasm_exports = null
let __wasm_table = null

// Is this the correct place for this function?
export async function __wasm_load(wasmFile) {
  table = new WebAssembly.Table({
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
