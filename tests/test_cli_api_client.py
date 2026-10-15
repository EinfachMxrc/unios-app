# SPDX-License-Identifier: AGPL-3.0-or-later

import json

import httpx
import pytest
from sqlalchemy import text

from app.cli.api_client import call_api


def test_cli_api_only_calls_local_api_and_confirms_writes(monkeypatch, tmp_path):
    seen = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/api/host":
            return httpx.Response(200, json={"mode": "host", "generation": 7})
        return httpx.Response(200, json={"ok": True})

    original_client = httpx.Client
    monkeypatch.setattr("app.cli.api_client.httpx.Client",
                        lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    assert call_api("GET", "/api/overview") == {"ok": True}
    assert str(seen[0].url) == "http://127.0.0.1:8000/api/overview"
    with pytest.raises(ValueError, match="lokale"):
        call_api("GET", "https://example.org/api/overview")
    with pytest.raises(ValueError, match="lokale"):
        call_api("GET", "/api/../health")
    with pytest.raises(ValueError, match="Schreibzugriff"):
        call_api("POST", "/api/notes")
    body = tmp_path / "body.json"
    body.write_text('{"title":"Test"}', encoding="utf-8")
    assert call_api("POST", "/api/notes", body_file=body, confirmed=True) == {"ok": True}
    assert seen[-1].headers["content-type"] == "application/json"
    assert seen[-1].headers["x-unios-lease-generation"] == "7"


def test_cli_api_binary_output_needs_file(monkeypatch, tmp_path):
    original_client = httpx.Client
    monkeypatch.setattr("app.cli.api_client.httpx.Client",
                        lambda **kwargs: original_client(
                            transport=httpx.MockTransport(lambda request: httpx.Response(
                                200, content=b"PDF", headers={"content-type": "application/pdf"})),
                            **kwargs))
    with pytest.raises(ValueError, match="--output"):
        call_api("GET", "/api/files/1")
    target = tmp_path / "file.pdf"
    assert call_api("GET", "/api/files/1", output=target)["bytes"] == 3
    assert target.read_bytes() == b"PDF"


def test_cli_api_delete_accepts_empty_success(monkeypatch):
    original_client = httpx.Client

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/host":
            return httpx.Response(200, json={"mode": "host", "generation": 3})
        assert request.headers["x-unios-lease-generation"] == "3"
        return httpx.Response(204)

    monkeypatch.setattr("app.cli.api_client.httpx.Client",
                        lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    assert call_api("DELETE", "/api/links/1", confirmed=True) == {"status": 204}


def test_cli_writes_through_real_auth_origin_and_generation_middleware(settings, factory, coordinator, monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from app.db.models import Course
    from app.main import create_app

    configured = settings.model_copy(update={"api_auth_required": True,
                                             "public_server_url": "https://cli.example.invalid"})
    app = create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)
    monkeypatch.setattr("app.cli.api_client.httpx.Client", lambda **kwargs: TestClient(
        app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000),
    ))
    result = call_api("POST", "/api/session/pair-code", confirmed=True)
    assert result["code"] and result["expires_at"]
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        course = Course(source="fixture", source_id="cli-write", name="Erfundener CLI-Kurs")
        session.add(course)
        session.commit()
        course_id = course.id
    # Exercise an ordinary write, not only an exempt pairing endpoint.
    body = tmp_path / "synthetic-note.json"
    body.write_text(json.dumps({"course_id": course_id, "title": "CLI-Fixture", "body": "Erfundener Inhalt"}),
                    encoding="utf-8")
    note = call_api("POST", "/api/notes", body_file=body, confirmed=True)
    assert note["note"]["title"] == "CLI-Fixture"
    assert note["body"] == "Erfundener Inhalt"
