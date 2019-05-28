#include <stdlib.h>
#include <stdint.h>

struct version_info {
  int major, minor, patch;
};

struct options {
  int size;
  struct version_info *version;
};

struct version_info *make_version_info(int major, int minor, int patch) {
  struct version_info *v = malloc(sizeof(struct version_info));
  v->major = major;
  v->minor = minor;
  v->patch = patch;
}

struct options *make_options(int c) {
  struct options *o = malloc(sizeof(struct options));
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
