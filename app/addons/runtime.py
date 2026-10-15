# SPDX-License-Identifier: AGPL-3.0-or-later

import base64
import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


def execute(binary: bytes, data: dict) -> dict:
    payload = json.dumps({"module": base64.b64encode(binary).decode("ascii"), "data": data})
    command = [sys.executable, "--addon-worker"] if getattr(sys, "frozen", False) else [sys.executable, "-I", str(Path(__file__).with_name("wasm_worker.py"))]
    environment = {key: value for key, value in os.environ.items() if key.upper() in {"SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP", "PROCESSOR_ARCHITECTURE", "PROCESSOR_ARCHITEW6432"}}
    with TemporaryDirectory(prefix="unios-wasm-") as folder:
        result = subprocess.run(command, input=payload, capture_output=True, text=True, encoding="utf-8",
                                timeout=5, cwd=folder, env=environment,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0, check=False)
    if result.returncode or len(result.stdout) > 40_000:
        raise ValueError("ADDON_WORKER_FAILED")
    response = json.loads(result.stdout)
    if not response.get("ok"):
        raise ValueError("ADDON_EXECUTION_FAILED")
    return response["output"]
