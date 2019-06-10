SYSROOT=$$HOME/Downloads/wasi-libc/sysroot
TARGET=wasm32-unknown-wasi

COMMA=,

SOURCES=../../lib/swablib.c build/stb_image.c main.c

OBJECTS=$(SOURCES:.c=.o)

IMPORTS=$(shell cat build/import.syms)
EXPORTS=$(shell cat build/export.syms)

CFLAGS=-I../../lib/ --sysroot=$(SYSROOT) --target=$(TARGET) -DSTB_IMAGE_IMPLEMENTATION
IMPORTFLAGS=-allow-undefined-file build/import.syms
EXPORTFLAGS=$(addprefix --export=, $(EXPORTS))
LDFLAGS=--import-memory --import-table $(IMPORTFLAGS) $(EXPORTFLAGS) -L$(SYSROOT)/lib/wasm32-wasi -lc

all: build/stb_image.wasm

clean:
	rm -f $(OBJECTS) build/import.syms build/export.syms build/stb_image.wasm build/stb_image.mjs build/stb_image.c

build/stb_image.wasm: $(OBJECTS)
	wasm-ld $(LDFLAGS) -o $@ $^ $(SYSROOT)/lib/wasm32-wasi/crt1.o

build/stb_image.c build/stb_image.mjs: stb_image.json
	node ../../bin/binder.js stb_image.json

%.o: %.c
	clang $(CFLAGS) -o $@ -c $<
