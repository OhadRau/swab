SYSROOT=$$HOME/Projects/wasi-sysroot/sysroot
TARGET=wasm32-unknown-wasi

COMMA=,

SOURCES=main.c basic-config.c ../lib/swablib.c build/basic-bindings.c

OBJECTS=$(SOURCES:.c=.o)

IMPORTS=$(shell cat build/import.syms)
EXPORTS=$(shell cat build/export.syms)

CFLAGS=-I../lib/ --sysroot=$(SYSROOT) --target=$(TARGET)
IMPORTFLAGS=-allow-undefined-file build/import.syms
EXPORTFLAGS=$(addprefix --export=, $(EXPORTS))
LDFLAGS=--no-entry --import-memory --import-table $(IMPORTFLAGS) $(EXPORTFLAGS) -L$(SYSROOT)/lib/wasm32-wasi -lc

all: build/basic-config.wasm

clean:
	rm -f $(OBJECTS) build/imports.syms build/export.syms build/basic-config.wasm build/basic-bindings.js build/basic-bindings.c

build/basic-config.wasm: $(OBJECTS)
	wasm-ld $(LDFLAGS) -o $@ $^

build/basic-bindings.c build/basic-bindings.js:
	npm run exec

%.o: %.c
	clang $(CFLAGS) -o $@ -c $<
