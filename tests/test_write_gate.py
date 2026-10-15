# SPDX-License-Identifier: AGPL-3.0-or-later

"""A handoff fence waits for accepted HTTP writers and rejects new ones."""

import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi.testclient import TestClient

from app.host.write_gate import WriteGate, WriteGateBusy
from app.main import create_app


def test_drain_waits_for_accepted_writer_then_reopens():
    gate = WriteGate()
    assert gate.enter()
    with ThreadPoolExecutor(max_workers=1) as pool:
        draining = pool.submit(gate.drain, timeout_seconds=2)
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            if not gate.enter():
                break
            gate.leave()
            time.sleep(0.001)
        else:
            raise AssertionError("Schreibsperre wurde nicht aktiviert")
        assert not draining.done()
        gate.leave()
        assert draining.result(timeout=1) is True
    assert gate.enter() is False
    gate.reopen()
    assert gate.enter() is True
    gate.leave()


def test_drain_timeout_keeps_new_writes_blocked_until_reopened():
    gate = WriteGate()
    assert gate.enter()
    assert gate.drain(timeout_seconds=0.01) is False
    assert gate.enter() is False
    gate.leave()
    gate.reopen()
    assert gate.enter() is True
    gate.leave()


def test_second_drain_cannot_reopen_first_handoff():
    gate = WriteGate()
    assert gate.drain(timeout_seconds=0)
    with pytest.raises(WriteGateBusy, match="bereits"):
        gate.drain(timeout_seconds=0)
    assert gate.enter() is False
    gate.reopen()
    assert gate.enter() is True
    gate.leave()


def test_running_app_rejects_new_writes_during_drain(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert app.state.write_gate.drain(timeout_seconds=0)
        assert client.get("/api/host").status_code == 200
        blocked = client.post("/api/host/snapshot")
        assert blocked.status_code == 423
        assert blocked.json()["detail"] == "Host-Übergabe läuft: Schreibzugriff gesperrt"
        assert not list((settings.data_dir / "host" / "snapshots").glob("*.json"))
        app.state.write_gate.reopen()
        assert client.post("/api/host/snapshot").status_code == 200


def test_app_drain_waits_for_inflight_request(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    entered = Event()
    finish = Event()

    @app.post("/__test__/held-write")
    def held_write():
        entered.set()
        assert finish.wait(15)
        return {"ok": True}

    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(client.post, "/__test__/held-write")
        # Coverage on shared CI runners can delay the ASGI worker's first dispatch.
        # Synchronize on its event rather than requiring a one-second startup.
        assert entered.wait(10)
        draining = pool.submit(app.state.write_gate.drain, timeout_seconds=10)
        deadline = time.monotonic() + 5
        while not app.state.write_gate.draining and time.monotonic() < deadline:
            time.sleep(0.001)
        assert app.state.write_gate.draining
        assert draining.done() is False
        assert client.post("/api/host/snapshot").status_code == 423
        finish.set()
        assert first.result(timeout=2).status_code == 200
        assert draining.result(timeout=2) is True
