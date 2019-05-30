import * as basic from './build/basic-bindings.mjs'

function version2string(version) {
  return `{ major: ${version.major}, minor: ${version.minor}, patch: ${version.patch} }`
}

function options2string(options) {
  return `{ size: ${options.size}, version: ${version2string(options.version.deref())} }`
}

let version = basic.make_version_info(1, 2, 3).deref()
console.log(version2string(version))

version.major = 3
version.minor = 2
version.patch = 1
console.log(version2string(version))
version.destroy()

let options = basic.make_options(5).deref()
console.log(options2string(options))
options.destroy()

console.log(basic.addI64(5n, 6n))

let array = [1, 2, 3]
let result = basic.arrayStuff(array)
let newArray = []
for (let i = 0; i < 3; i++) {
  newArray.push(result.offset(i).deref())
}
console.log(newArray)

let string = "hello"
console.log(basic.stringStuff(string))

basic.callback(x => console.log(x))

console.log(basic.uncallback()(1));
