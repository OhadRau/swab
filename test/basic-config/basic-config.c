#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include "basic-config.h"

version_info *make_version_info(int major, int minor, int patch) {
  version_info *v = malloc(sizeof(version_info));
  v->major = major;
  v->minor = minor;
  v->patch = patch;
  return v;
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
  for (int i = 0; i < 3; i++) {
    arr[i] += 1;
  }
  return arr;
}

char *stringStuff(char *str) {
  int len = strlen(str);
  for (int i = 0; i < len; i++) {
    if (str[i] >= 'a' && str[i] <= 'z') {
      str[i] = str[i] - ('a' - 'A');
    }
  }
  return str;
}

void callback(void (*f)(int)) {
  f(777);
}

int plusOne(int x) {
  return x + 1;
}

int (*uncallback())(int) {
  return &plusOne;
}
