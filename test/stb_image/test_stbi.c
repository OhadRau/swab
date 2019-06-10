#include <stdio.h>
#include "stb_image.h"

int main(int argc, char **argv) {
  int width, height, bpp;
  unsigned char *buffer = stbi_load("hi.png", &width, &height, &bpp, STBI_rgb);
//  unsigned char *buffer = stbi_load("google-16.png", &width, &height, &bpp, STBI_rgb);

  for (int i = 0; i < width * height * bpp; i += bpp) {
    unsigned char *rgb = &buffer[i];
    unsigned char r = rgb[0];
    unsigned char g = rgb[1];
    unsigned char b = rgb[2];
    if (r > g && r > b) {
      printf("\x1b[31m█\x1b[0m");
    } else if (g > r && g > b) {
      printf("\x1b[32m█\x1b[0m");
    } else if (b > g && b > r) {
      printf("\x1b[34m█\x1b[0m");
    } else {
      printf(" ");
    }
    if (i % (width * bpp) == 0) {
      printf("\n");
    }
  }
}
