SYSROOT=$$HOME/Projects/wasi-sysroot/sysroot
TARGET=wasm32-unknown-wasi

SOURCES=basic-config.c ../lib/bindlib.c build/basic-config-bindings.c

OBJECTS=$(SOURCES:.c=.o)

CFLAGS=-I../lib/ --sysroot $(SYSROOT) --target=$(TARGET)
IMPORTFLAGS=-allow-undefined-file build/import.syms
EXPORTFLAGS=-exported_symbols_list build/export.syms
LDFLAGS=--no-entry --import-memory --import-table $(IMPORT_FLAGS) $(EXPORT_FLAGS)

all: build/basic-config.wasm

clean:
	rm -f $(OBJECTS) build/imports.syms build/export.syms build/basic-config.wasm build/basic-config-bindings.js build/basic-config-bindings.c

build/basic-config.wasm: $(OBJECTS)
	wasm-ld --no-entry --import-memory --import-table -o $@ $^

build/basic-config-bindings.c build/basic-config-bindings.js:
	npm run exec

%.o: %.c
	clang $(CFLAGS) -o $@ -c $<
