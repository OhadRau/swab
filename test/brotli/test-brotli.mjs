import * as swab from '../../lib/swablib.mjs'
import * as brotli from './build/brotli.mjs'

let input = 'Hello world. This is a demo of compression using Brotli.'

// Copy the string into a char[]
// TODO: Find an easier way to do this
let input_buffer = swab.allocate(brotli.__types.char, input.length + 1)
for (let i = 0; i < input.length; i++) {
  input_buffer.offset(i).assign(input[i])
}
input_buffer.offset(input.length).assign('\0')

// Compute the maximum size of the output buffer
let max_size = brotli.BrotliEncoderMaxCompressedSize(input.length + 1) // null terminator

let encoded_size = swab.allocate(brotli.__types.u32)
encoded_size.assign(max_size)

let encoded_buffer = swab.allocate(brotli.__types.char, max_size)

// Compress the input
brotli.BrotliEncoderCompress(
  11, /* BROTLI_MAX_QUALITY */
  24, /* BROTLI_MAX_WINDOW_BITS */
  "BROTLI_MODE_TEXT",
  input.length + 1,
  input_buffer,
  encoded_size,
  encoded_buffer
)

// Copy the encoded buffer into a string so we can print it out
let estr = ''
for (let i = 0; i < encoded_size.deref(); i++) {
  estr += encoded_buffer.offset(i).deref()
}
console.log(`ENCODED: ${estr}`)

let decoded_size = swab.allocate(brotli.__types.u32)
decoded_size.assign(max_size)
  
let decoded_buffer = swab.allocate(brotli.__types.char, max_size)

// Decompress the input
brotli.BrotliDecoderDecompress(
  encoded_size.deref(),
  encoded_buffer,
  decoded_size,
  decoded_buffer
)

// Copy the decoded buffer into a string so we can print it out
let dstr = ''
for (let i = 0; i < decoded_size.deref(); i++) {
  dstr += decoded_buffer.offset(i).deref()
}
console.log(`DECODED: ${dstr}`)
