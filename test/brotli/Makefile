SYSROOT=$$HOME/Projects/wasi-sysroot/sysroot
TARGET=wasm32-wasi

COMMA=,

SOURCES=main.c build/brotli.c $(wildcard brotli/c/common/*.c) \
        $(wildcard brotli/c/dec/*.c) $(wildcard brotli/c/enc/*.c)

OBJECTS=$(SOURCES:.c=.o)

IMPORTS=$(shell cat build/import.syms)
EXPORTS=$(shell cat build/export.syms)

CFLAGS=-I../../lib/ -Ibrotli/c/include --sysroot=$(SYSROOT) --target=$(TARGET)
IMPORTFLAGS=-allow-undefined-file build/import.syms
EXPORTFLAGS=$(addprefix --export=, $(EXPORTS))
LDFLAGS=--no-entry --import-memory --import-table $(IMPORTFLAGS) $(EXPORTFLAGS) -L$(SYSROOT)/lib/wasm32-wasi -lc

all: build/brotli.wasm

clean:
	rm -f $(OBJECTS) build/import.syms build/export.syms build/brotli.wasm build/brotli.mjs build/brotli.c

build/brotli.wasm: $(OBJECTS)
	wasm-ld $(LDFLAGS) -o $@ $^

build/brotli.c build/brotli.mjs build/import.syms build/export.syms: brotli.json
	node ../../bin/binder.js brotli.json

%.o: %.c
	clang $(CFLAGS) -o $@ -c $<
