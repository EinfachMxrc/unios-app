# SPDX-License-Identifier: AGPL-3.0-or-later
"""HTTP boundaries continue to protect fictional state after the review fixes."""

import json
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_app
from app.setup.api import setup_router


def test_new_private_api_namespaces_are_not_cacheable_in_local_mode(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for path in ("/api/learning/assessment/types", "/api/entities/schema", "/api/study/missing"):
            assert client.get(path).headers.get("cache-control") == "private, no-store"


def test_portal_sample_router_checks_writer_without_global_middleware(settings, factory, coordinator, monkeypatch):
    calls = []
    monkeypatch.setattr(coordinator, "assert_writer", lambda: calls.append("writer"))
    app = FastAPI()
    app.include_router(setup_router(settings, SimpleNamespace(factory=factory), coordinator))
    with TestClient(app) as client:
        client.post("/api/setup/portals/unknown/samples", json={"pages": [{"kind": "start", "html": "<p>fixture</p>"}]})
    assert calls == ["writer"]


def test_host_release_is_journalled_without_entering_its_own_write_gate(settings, factory, coordinator, monkeypatch):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    monkeypatch.setattr("app.main.require_syncthing_ready", lambda settings: None)
    with TestClient(app) as client:
        response = client.post("/api/host/release")
        assert response.status_code == 200
    events = [json.loads(line) for line in (settings.local_dir / "host-actions.jsonl").read_text().splitlines()]
    intent = next(event for event in events if event.get("path") == "/api/host/release")
    assert any(event.get("id") == intent["id"] and event.get("kind") == "result" for event in events)
