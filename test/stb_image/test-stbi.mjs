import * as swab from '../../lib/swablib.mjs'
import * as stbi from './build/stb_image.mjs'

stbi._start();

let width  = swab.allocate(stbi.__types.int),
    height = swab.allocate(stbi.__types.int),
    bpp    = swab.allocate(stbi.__types.int);

width.assign(16);
height.assign(16);
bpp.assign(4);

const img_data =
  stbi.stbi_load("hi.png", width, height, bpp, "STBI_rgb");
//  stbi.stbi_load("google-16.png", width, height, bpp, "STBI_rgb_alpha");

console.log(stbi.stbi_failure_reason());

let buffer = '';
console.log(`WIDTH: ${width.deref()}, HEIGHT: ${height.deref()}, BPP: ${bpp.deref()}`)
for (let i = 0; i < width.deref() * height.deref() * bpp.deref(); i += bpp.deref()) {
  console.log(`OFFSET: ${i}`)
  let rgb = img_data.offset(i);
  let r = rgb.offset(0).deref(),
      g = rgb.offset(1).deref(),
      b = rgb.offset(2).deref(),
      a = rgb.offset(3).deref();
  if (r > g && r > b) {
    buffer += '\x1b[31m█\x1b[0m';
  } else if (g > r && g > b) {
    buffer += '\x1b[32m█\x1b[0m';
  } else if (b > r && b > g) {
    buffer += '\x1b[34m█\x1b[0m';
  } else {
    buffer += ' ';
  }
  if (i % (width.deref() * bpp.deref()) === 0) {
    buffer += '\n';
  }
  console.log(`{ r: ${r}, g: ${g}, b: ${b} }`);
}
console.log(buffer);

width.free();
height.free();
bpp.free();
stbi.stbi_image_free(img_data);
