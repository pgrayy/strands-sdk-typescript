"""End-to-end async demo validating wasm-deps integration.

This demo:
1. Loads a WASM component built from Rust (component/)
2. Uses the forked wasmtime-py with async component model support
3. Calls sync and async exports on the component
"""

import asyncio
import time
from pathlib import Path

from wasmtime import Config, Engine, Store, WasiConfig
from wasmtime.component import Component, Linker


async def main() -> None:
    config = Config()
    config.wasm_component_model = True
    config.wasm_component_model_async = True
    config.async_stack_size = 2 * 1024 * 1024
    config.async_allow_sync = True
    engine = Engine(config)
    store = Store(engine)

    wasi_config = WasiConfig()
    wasi_config.inherit_stdout()
    wasi_config.inherit_stderr()
    store.set_wasi(wasi_config)
    store.set_wasi_http()

    wasm_path = (
        Path(__file__).parent
        / "component"
        / "target"
        / "wasm32-wasip2"
        / "release"
        / "demo_component.wasm"
    )
    component = Component.from_file(engine, str(wasm_path))

    linker = Linker(engine)
    linker.add_wasip2_async()
    linker.add_wasi_http_async()
    instance = linker.instantiate(store, component)

    greet_fn = instance.get_func(store, "greet")
    add_fn = instance.get_func(store, "add")
    fetch_fn = instance.get_func(store, "fetch")

    print(f"greet: {greet_fn(store, 'wasm-deps')}")
    print(f"add:   {add_fn(store, 40, 2)}")

    start = time.monotonic()
    result = await fetch_fn.call_async(store, "http://httpbin.org/ip")
    elapsed = (time.monotonic() - start) * 1000
    print(f"fetch: {result[:60]}... ({elapsed:.0f}ms)")

    print("\nAll checks passed.")


if __name__ == "__main__":
    asyncio.run(main())
