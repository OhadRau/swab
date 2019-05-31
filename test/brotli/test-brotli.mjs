import * as swab from '../../lib/swablib.mjs'
import * as brotli from './build/brotli.mjs'

let opaquePtr = brotli.malloc(1)
let alloc = (_opaquePtr, size) => brotli.malloc(size)
let free = (_opaquePtr, ptr) => brotli.free(ptr)

let encoder =
  brotli.BrotliEncoderCreateInstance(alloc, free, opaquePtr)
brotli.BrotliEncoderDestroyInstance(encoder)

let input = 'Hello world. This is a demo of compression using Brotli.'

let input_buffer = swab.allocate(brotli.__types.char, input.length + 1)

for (let i = 0; i < input.length; i++) {
  input_buffer.offset(i).assign(input[i])
}
input_buffer.offset(input.length).assign('\0')

let max_size = brotli.BrotliEncoderMaxCompressedSize(input.length + 1) // null terminator

// TODO: This number is displayed wrong in JS. Maybe don't offset for unsigned ints?
console.log(`MAX SIZE: ${max_size}`)

// TODO: Easier way of creating typed pointers
let encoded_size = swab.allocate(brotli.__types.u32)
encoded_size.assign(max_size)

let encoded_buffer = swab.allocate(brotli.__types.char, max_size)
console.log(`ADDR: ${encoded_buffer.addr}`)

let encodeStatus =
  brotli.BrotliEncoderCompress(
    11, /* BROTLI_MAX_QUALITY */
    24, /* BROTLI_MAX_WINDOW_BITS */
    "BROTLI_MODE_TEXT",
    input.length + 1,
    input_buffer,
    encoded_size,
    encoded_buffer
  )

console.log(`STATUS: ${encodeStatus}`)

console.log(`LENGTH: ${encoded_size.deref()}`)
let estr = ''
for (let i = 0; i < encoded_size.deref(); i++) {
  estr += encoded_buffer.offset(i).deref()
}
console.log(`ENCODED: ${estr}`)

let decoded_size = swab.allocate(brotli.__types.u32)
decoded_size.assign(max_size)
  
let decoded_buffer = swab.allocate(brotli.__types.char, max_size)
console.log(`ADDR: ${decoded_buffer.addr}`)

let decodeStatus =
  brotli.BrotliDecoderDecompress(
    encoded_size.deref(),
    encoded_buffer,
    decoded_size,
    decoded_buffer
  )

console.log(`STATUS: ${decodeStatus}`)

console.log(`LENGTH: ${decoded_size.deref()}`)
let dstr = ''
for (let i = 0; i < decoded_size.deref(); i++) {
  dstr += decoded_buffer.offset(i).deref()
}
console.log(`DECODED: ${dstr}`)
