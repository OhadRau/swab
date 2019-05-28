#include <stdlib.h>
#include <stdint.h>
#include "basic-config.h"

version_info *make_version_info(int major, int minor, int patch) {
  version_info *v = malloc(sizeof(version_info));
  v->major = major;
  v->minor = minor;
  v->patch = patch;
}

options *make_options(int c) {
  options *o = malloc(sizeof(options));
  o->size = c;
  o->version = make_version_info(c, c + 1, c + 2);
  return o;
}

int64_t addI64(int64_t a, int64_t b) {
  return a + b;
}

int *arrayStuff(int arr[3]) {
  return arr;
}

char *stringStuff(char *str) {
  return str;
}
