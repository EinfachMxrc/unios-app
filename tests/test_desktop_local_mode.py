# SPDX-License-Identifier: AGPL-3.0-or-later
"""A fresh install can choose to run on its own, and then works with no server at all.

Drives the real `uniosd serve` start-up decision (desktop/backend.py) in an empty temporary
home. uvicorn is replaced so nothing binds a port and no real instance is touched.
"""

import importlib.util
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app.config import get_settings

BACKEND = Path(__file__).resolve().parents[1] / "desktop" / "backend.py"
LOCAL_HEADERS = {"Origin": "http://127.0.0.1:8000", "Sec-Fetch-Site": "same-origin"}


def load_backend():
    spec = importlib.util.spec_from_file_location("unios_desktop_backend", BACKEND)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def serve(monkeypatch, home):
    """Run `uniosd serve` once; return the ASGI app it would hand to uvicorn."""
    import uvicorn

    started = []
    monkeypatch.setattr(uvicorn, "run", lambda app, **kwargs: started.append((app, kwargs)))
    # configure_runtime() writes these straight into os.environ and changes the working
    # directory; registering them with monkeypatch restores both after the test.
    for name in ("DATA_DIR", "LOCAL_DIR", "REACT_DIST_DIR", "SERVE_REACT", "VOICE_MODEL_DIR"):
        monkeypatch.setenv(name, "")
        monkeypatch.delenv(name)
    monkeypatch.chdir(Path.cwd())
    monkeypatch.setenv("UNIOS_HOME", str(home))
    monkeypatch.setattr(sys, "argv", ["uniosd", "serve"])
    get_settings.cache_clear()
    try:
        assert load_backend().main() == 0
    finally:
        get_settings.cache_clear()
    assert len(started) == 1 and started[0][1]["port"] == 8000
    return started[0][0]


async def call(app, method, path, **kwargs):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8000",
                                 headers=LOCAL_HEADERS) as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.anyio
async def test_fresh_install_chooses_local_and_then_runs_without_any_server(monkeypatch, tmp_path):
    home = tmp_path / "UniOS"
    if not (Path(__file__).resolve().parents[1] / "frontend" / "dist" / "index.html").is_file():
        pytest.skip("frontend build missing")

    # First start: nothing decided, so the companion offers both ways.
    first = serve(monkeypatch, home)
    assert (await call(first, "GET", "/health")).json() == {"status": "ok", "mode": "client"}
    status = (await call(first, "GET", "/api/client/status")).json()
    assert status["mode"] == "client" and status["configured"] is False
    assert not (home / "local" / "uni_os.sqlite3").exists()

    # "Only on this device": records the choice, no credentials, no server contact.
    chosen = await call(first, "POST", "/api/client/use-local")
    assert chosen.status_code == 200 and chosen.json() == {"mode": "local"}

    # The restart goes into the full local app with its own database.
    second = serve(monkeypatch, home)
    assert (home / "local" / "uni_os.sqlite3").exists()
    async with second.router.lifespan_context(second):
        assert (await call(second, "GET", "/api/client/status")).status_code == 404  # no client bridge
        setup = await call(second, "GET", "/api/setup/status")
        assert setup.status_code == 200, setup.text
        host = (await call(second, "GET", "/api/host")).json()
        assert host["mode"] == "host"  # this device is the writer: nothing waits for a server
        created = await call(second, "POST", "/api/jots", json={
            "id": str(uuid4()), "kind": "thought", "body": "Lokal ohne Server",
            "created_at": datetime.now(UTC).isoformat()},
            headers={"X-UniOS-Lease-Generation": str(host["generation"])})
        assert created.status_code == 200, created.text
        bodies = [jot["body"] for jot in (await call(second, "GET", "/api/jots")).json()["jots"]]
        assert bodies == ["Lokal ohne Server"]

    # Restarting again keeps the choice and the data.
    third = serve(monkeypatch, home)
    async with third.router.lifespan_context(third):
        bodies = [jot["body"] for jot in (await call(third, "GET", "/api/jots")).json()["jots"]]
        assert bodies == ["Lokal ohne Server"]
