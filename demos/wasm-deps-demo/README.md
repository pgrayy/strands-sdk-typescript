# wasm-deps Demo

Demonstrates the wasm-deps integration: a Rust WASM component loaded by the forked wasmtime-py with async support.

## Prerequisites

- Rust with `wasm32-wasip2` target: `rustup target add wasm32-wasip2`
- Python 3.10+
- Forked wasmtime-py (from wasm-deps GitHub Release or local build)

## Setup

```bash
# Install the forked wasmtime-py (from local wasm-deps checkout or release wheel)
pip install -e ../../forks/wasmtime-py
# Or from a GitHub Release:
# pip install https://github.com/pgrayy/wasm-deps/releases/download/v0.1.0/wasmtime-...-macosx_11_0_arm64.whl
```

## Build the WASM component

```bash
cd component
cargo build --target wasm32-wasip2 --release
```

## Run the demo

```bash
python demo.py
```

Expected output:

```
greet: Hello, wasm-deps! Greetings from a WASM component.
add:   42
fetch: HTTP 200 | {"origin": "..."}... (XXms)

All checks passed.
```
