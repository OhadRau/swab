#ifndef BASIC_CONFIG_H
#define BASIC_CONFIG_H

#include <stdint.h>

typedef struct {
  int major, minor, patch;
} version_info;

typedef struct {
  int size;
  version_info *version;
} options;

typedef union {
  int i;
  float f;
} value;

version_info *make_version_info(int major, int minor, int patch);
options *make_options(int c);

int64_t addI64(int64_t a, int64_t b);

int *arrayStuff(int arr[3]);
char *stringStuff(char *str);

#endif
