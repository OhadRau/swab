SYSROOT=$$HOME/Projects/wasi-sysroot/sysroot
TARGET=wasm32-unknown-wasi

COMMA=,

SOURCES=main.c basic-config.c ../../lib/swablib.c build/basic-bindings.c

OBJECTS=$(SOURCES:.c=.o)

IMPORTS=$(shell cat build/import.syms)
EXPORTS=$(shell cat build/export.syms)

CFLAGS=-I../../lib/ --sysroot=$(SYSROOT) --target=$(TARGET)
IMPORTFLAGS=-allow-undefined-file build/import.syms
EXPORTFLAGS=$(addprefix --export=, $(EXPORTS))
LDFLAGS=--entry=main --import-memory --import-table $(IMPORTFLAGS) $(EXPORTFLAGS) -L$(SYSROOT)/lib/wasm32-wasi -lc

all: build/basic-bindings.wasm

clean:
	rm -f $(OBJECTS) build/import.syms build/export.syms build/basic-bindings.wasm build/basic-bindings.mjs build/basic-bindings.c

build/basic-bindings.wasm: $(OBJECTS)
	wasm-ld $(LDFLAGS) -o $@ $^

build/basic-bindings.c build/basic-bindings.mjs: basic-config.json
	node ../../bin/binder.js basic-config.json

%.o: %.c
	clang $(CFLAGS) -o $@ -c $<
