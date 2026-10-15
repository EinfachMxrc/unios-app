# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from pathlib import Path

import pytest
import wasmtime
from fastapi.testclient import TestClient

from app.addons.runtime import execute
from app.main import create_app


def test_real_wasm_package_requires_current_approval(settings, factory, coordinator):
    package = json.loads((Path(__file__).parents[1] / "examples/addons/isolated-tool.unios-addon.json").read_text(encoding="utf-8"))
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        imported = client.post("/api/addons/import-package", json=package)
        assert imported.status_code == 200
        url = "/api/addons/" + package["manifest"]["id"]
        grant = {"fingerprint": imported.json()["fingerprint"]}
        assert client.post(url + "/execute", json=grant).status_code == 403
        for action in ("install", "approve", "enable"):
            assert client.post(url + "/" + action, json=grant).status_code == 200
        result = client.post(url + "/execute", json=grant)
        assert result.status_code == 200 and result.json()["title"] == "WASM bereit"
        assert client.post(url + "/revoke", json=grant).status_code == 200
        assert client.post(url + "/execute", json=grant).status_code == 403
        # Changed binary cannot reuse an approval, even with a matching manifest.
        path = settings.local_dir / "addon-modules" / (package["manifest"]["wasm_sha256"] + ".wasm")
        path.write_bytes(b"changed fixture")
        for action in ("approve", "enable"):
            assert client.post(url + "/" + action, json=grant).status_code == 200
        assert client.post(url + "/execute", json=grant).status_code == 422


@pytest.mark.parametrize("wat", [
    '(module (import "wasi_snapshot_preview1" "path_open" (func)))',
    '(module (memory (export "memory") 1) (func (export "alloc") (param i32) (result i32) i32.const 0) (func (export "run") (param i32 i32) (result i64) (loop $forever br $forever) i64.const 0))',
    '(module (memory (export "memory") 300) (func (export "alloc") (param i32) (result i32) i32.const 0) (func (export "run") (param i32 i32) (result i64) i64.const 0))',
])
def test_worker_rejects_imports_infinite_loop_and_memory_exhaustion(wat):
    with pytest.raises(ValueError, match="ADDON_EXECUTION_FAILED"):
        execute(bytes(wasmtime.wat2wasm(wat)), {})
