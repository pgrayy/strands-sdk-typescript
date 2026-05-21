# wasm-deps Demo

Demonstrates a Rust WASM component loaded by the forked wasmtime-py (`pgrayy-wasmtime`) with async component model support.

## Prerequisites

- Rust with `wasm32-wasip2` target: `rustup target add wasm32-wasip2`
- Python 3.10+

## Setup

```bash
# Create a venv and install dependencies
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Build the WASM component

```bash
cd component
cargo build --target wasm32-wasip2 --release
cd ..
```

## Run the demo

```bash
python demo.py
```

Expected output:

```
greet: Hello, wasm-deps! Greetings from a WASM component.
add:   42
Success! pgrayy-wasmtime with async component model works.
```
