#ifndef BASIC_CONFIG_H
#define BASIC_CONFIG_H

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

#endif
