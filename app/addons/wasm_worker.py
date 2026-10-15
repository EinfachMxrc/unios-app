# SPDX-License-Identifier: AGPL-3.0-or-later

"""Trusted standalone worker. Guests have no imports, WASI or host handles."""

import base64
import json
import sys

import wasmtime


def run(binary: bytes, data: dict) -> dict:
    if len(binary) > 2_000_000:
        raise ValueError("MODULE_LIMIT")
    config = wasmtime.Config()
    config.consume_fuel = True
    config.wasm_threads = False
    engine = wasmtime.Engine(config)
    module = wasmtime.Module(engine, binary)
    if module.imports:
        raise ValueError("IMPORT_DENIED")
    store = wasmtime.Store(engine)
    store.set_fuel(2_000_000)
    store.set_limits(memory_size=16 * 1024 * 1024, table_elements=1000, instances=1, tables=1, memories=1)
    exports = wasmtime.Instance(store, module, []).exports(store)
    memory, alloc, execute = exports["memory"], exports["alloc"], exports["run"]
    if not isinstance(memory, wasmtime.Memory) or not isinstance(alloc, wasmtime.Func) or not isinstance(execute, wasmtime.Func):
        raise TypeError("ABI_INVALID")
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    if len(payload) > 65_536:
        raise ValueError("INPUT_LIMIT")
    pointer = alloc(store, len(payload))
    if not isinstance(pointer, int) or pointer < 0 or pointer + len(payload) > memory.data_len(store):
        raise TypeError("ABI_INVALID")
    memory.write(store, payload, pointer)
    packed = execute(store, pointer, len(payload))
    if not isinstance(packed, int):
        raise TypeError("ABI_INVALID")
    start, length = (packed >> 32) & 0xffffffff, packed & 0xffffffff
    if length > 32_768 or start + length > memory.data_len(store):
        raise ValueError("OUTPUT_LIMIT")
    output = json.loads(bytes(memory.read(store, start, start + length)).decode("utf-8"))
    if not isinstance(output, dict) or set(output) != {"title", "body"}:
        raise ValueError("OUTPUT_INVALID")
    if not isinstance(output["title"], str) or not 1 <= len(output["title"]) <= 80 or not isinstance(output["body"], str) or len(output["body"]) > 8000:
        raise ValueError("OUTPUT_INVALID")
    return output


def main():
    try:
        request = json.loads(sys.stdin.buffer.read(2_800_000))
        output = run(base64.b64decode(request["module"], validate=True), request["data"])
        sys.stdout.write(json.dumps({"ok": True, "output": output}))
    except Exception:  # noqa: BLE001 - never expose guest code, data or arbitrary errors
        sys.stdout.write('{"ok":false,"error_code":"ADDON_EXECUTION_FAILED"}')


if __name__ == "__main__":
    main()
