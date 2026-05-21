"""End-to-end demo validating pgrayy-wasmtime async component model support."""

from pathlib import Path

from wasmtime import Config, Engine, Store, WasiConfig
from wasmtime.component import Component, Linker


def main() -> None:
    config = Config()
    config.wasm_component_model = True
    config.wasm_component_model_async = True
    config.async_stack_size = 512 * 1024
    config.async_allow_sync = True
    engine = Engine(config)
    store = Store(engine)

    wasi = WasiConfig()
    wasi.inherit_stdout()
    wasi.inherit_stderr()
    store.set_wasi(wasi)
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

    print(f"greet: {greet_fn(store, 'wasm-deps')}")
    print(f"add:   {add_fn(store, 40, 2)}")
    print("Success! pgrayy-wasmtime with async component model works.")


if __name__ == "__main__":
    main()
