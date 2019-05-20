export function createEnv() {
  return {
    wrapperCache: {},
    sizeofTable: {},
    i64Table: {},
    jsBuffer: "",
    cBuffer: '#include "bindlib.h"\n'
  }
}

let uniq = 0
export function gensym() {
  return `__uniq${uniq++}`
}
