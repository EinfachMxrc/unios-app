# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local assistant setup and scoped personal context, using invented data."""

import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.ai.connection import McpConnection, load_mcp_connection
from app.db.models import CalendarEvent, Course, Deadline, MailItem
from app.integrations.storage import ConnectionError
from app.main import create_app


class MemoryVault:
    def __init__(self, *_args):
        self.values = {}

    def available(self):
        return True

    def read(self, alias):
        return self.values.get(alias, {})

    def save(self, alias, value):
        self.values[alias] = value


def test_setup_keeps_credentials_out_of_config_and_obeys_revocation(settings, factory, coordinator, monkeypatch):
    vault = MemoryVault()
    monkeypatch.setattr("app.ai.connection.Vault", lambda *_: vault)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post("/api/ai/connection", headers={"Origin": "https://foreign.example"}).status_code == 403
        assert client.post("/api/ai/connection").json() == {"configured": True, "enabled": True}
        token = settings.mcp_token
        configuration = client.get("/api/ai/connection").json()
        assert len(token) >= 32 and token not in str(configuration)
        assert token not in McpConnection(settings).store.path.read_text()
        headers = {"X-UniOS-MCP-Token": token}
        assert client.get("/api/ai/mcp/courses", headers=headers).status_code == 200
        client.put("/api/ai/mcp/state", json={"enabled": False})
        assert client.get("/api/ai/mcp/courses", headers=headers).status_code == 503
        # Restart reloads the token, but does not silently enable the database gate.
        settings.mcp_token = ""
        load_mcp_connection(settings)
        assert settings.mcp_token == token
        assert client.get("/api/ai/mcp/courses", headers=headers).status_code == 503
        vault.values.clear()
        load_mcp_connection(settings)
        assert not settings.mcp_enabled and not settings.mcp_token


def test_unavailable_vault_fails_without_plaintext_fallback(settings, factory, coordinator, monkeypatch):
    vault = MemoryVault()
    def unavailable(*_args):
        raise ConnectionError("fixture vault unavailable")
    vault.save = unavailable
    monkeypatch.setattr("app.ai.connection.Vault", lambda *_: vault)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post("/api/ai/connection").status_code == 503
        assert not McpConnection(settings).store.path.exists()
        assert not settings.mcp_token


def test_personal_context_requires_release_and_excludes_private_sources(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "synthetic-test-token"
    now = datetime.now(UTC)
    with factory() as session:
        course = Course(source="fixture", source_id="blocked", name="Private fixture course")
        session.add(course)
        session.flush()
        deadline = Deadline(source="fixture", source_key="blocked", course_id=course.id,
                            title="Hidden deadline", due_at=now)
        session.add(deadline)
        session.flush()
        session.add_all([
            CalendarEvent(source="fixture", source_key="one", title="Visible lecture", starts_at=now,
                          url="https://example.invalid/?token=private-subscription"),
            CalendarEvent(source="fixture", source_key="two", title="Hidden lecture", starts_at=now,
                          course_id=course.id),
            CalendarEvent(source="fixture", source_key="old", title="Past lecture",
                          starts_at=now - timedelta(days=40)),
            MailItem(source_hash="a" * 64, sender="fixture@example.invalid", subject="Visible mail", received_at=now),
            MailItem(source_hash="b" * 64, sender="fixture@example.invalid", subject="Hidden mail", received_at=now,
                     deadline_id=deadline.id),
        ])
        session.commit()
        blocked_id = course.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    headers = {"X-UniOS-MCP-Token": settings.mcp_token}
    with TestClient(app) as client:
        for route in ("timetable", "mail"):
            assert client.get(f"/api/ai/mcp/{route}", headers=headers).status_code == 403
            client.put(f"/api/ai/access/category/{route}", json={"allowed": True})
        client.put(f"/api/ai/access/course/{blocked_id}", json={"allowed": False})
        events = client.get("/api/ai/mcp/timetable", headers=headers).json()
        assert [event["title"] for event in events["events"]] == ["Visible lecture"]
        assert events["events"][0]["starts_at"].endswith("+00:00")
        assert "url" not in str(events) and "private-subscription" not in str(events)
        mail = client.get("/api/ai/mcp/mail", headers=headers).json()
        assert [item["subject"] for item in mail["messages"]] == ["Visible mail"]
        assert not mail["includes_body"] and not mail["includes_attachments"]
        assert client.get("/api/ai/mcp/mail?limit=101", headers=headers).status_code == 422
        client.put("/api/ai/access/category/mail", json={"allowed": False})
        assert client.get("/api/ai/mcp/mail", headers=headers).status_code == 403
        assert any(item["tool"] == "get_mail_hints" and not item["permitted"]
                   for item in client.get("/api/ai/mcp/audit").json())


def test_busy_host_reports_a_retryable_error_without_logging_sql_or_credentials(settings, factory, coordinator,
                                                                               monkeypatch, caplog):
    vault = MemoryVault()
    monkeypatch.setattr("app.ai.connection.Vault", lambda *_: vault)

    def busy(_factory):
        original = sqlite3.OperationalError("database is locked")
        original.sqlite_errorcode = sqlite3.SQLITE_BUSY
        raise OperationalError("private SQL fixture", {"token": "private-fixture-value"}, original)

    monkeypatch.setattr("app.ai.connection_api.enable_connection", busy)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post("/api/ai/connection")
        assert response.status_code == 503
        assert response.json()["code"] == "AI_HOST_BUSY"
        assert "private-fixture-value" not in caplog.text and "private SQL" not in caplog.text
