# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic consent, private calendar subscriptions and host-safe reconciliation."""

import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.calendar.service import normalize_feed_url, parse_feed
from app.db.models import CalendarEvent, MailItem
from app.integrations.storage import ConnectionError, Vault
from app.mail.service import GRAPH, MailService
from app.main import create_app
from app.sync.scheduler import SyncScheduler


@pytest.fixture
def memory_vault(monkeypatch):
    values = {}
    monkeypatch.setattr(Vault, "available", staticmethod(lambda: True))
    monkeypatch.setattr("keyring.get_password", lambda service, alias: values.get((service, alias)))
    monkeypatch.setattr("keyring.set_password", lambda service, alias, value: values.__setitem__((service, alias), value))
    monkeypatch.setattr("keyring.delete_password", lambda service, alias: values.pop((service, alias), None))
    return values


def fake_client(monkeypatch, handler):
    original = httpx.Client
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original(transport=transport, **kwargs))


def calendar_bytes(start: datetime, *, cancelled=False, room="R101") -> bytes:
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Synthetic//EN\r\n"
            "BEGIN:VEVENT\r\nUID:fixture-lecture\r\nSUMMARY:Testvorlesung\r\n"
            f"LOCATION:{room}\r\nDTSTART:{start:%Y%m%dT%H%M%SZ}\r\n"
            f"DTEND:{start + timedelta(hours=1):%Y%m%dT%H%M%SZ}\r\n"
            "RRULE:FREQ=WEEKLY;COUNT=4\r\n"
            f"EXDATE:{start + timedelta(weeks=1):%Y%m%dT%H%M%SZ}\r\n"
            "END:VEVENT\r\n"
            "BEGIN:VEVENT\r\nUID:fixture-lecture\r\nSUMMARY:Verschoben\r\n"
            f"RECURRENCE-ID:{start + timedelta(weeks=2):%Y%m%dT%H%M%SZ}\r\n"
            f"DTSTART:{start + timedelta(weeks=2, hours=2):%Y%m%dT%H%M%SZ}\r\n"
            f"DTEND:{start + timedelta(weeks=2, hours=3):%Y%m%dT%H%M%SZ}\r\n"
            + ("STATUS:CANCELLED\r\n" if cancelled else "")
            + "END:VEVENT\r\nEND:VCALENDAR\r\n").encode()


def test_vault_large_tokens_are_chunked_replaced_and_revoked(settings, memory_vault):
    vault = Vault(settings.local_dir, settings.institution_slug, "test")
    vault.save("tokens", {"refresh_token": "synthetic-" * 1500})
    assert vault.read("tokens")["refresh_token"].startswith("synthetic-")
    assert all(len(value) <= 700 for (service, alias), value in memory_vault.items() if ":" in alias)
    vault.save("tokens", {"refresh_token": "replacement"})
    assert len(memory_vault) == 2
    vault.remove("tokens")
    assert not memory_vault


def test_ical_weekly_exceptions_moves_cancellations_and_timezone(settings):
    start = datetime.now(UTC).replace(hour=8, minute=0, second=0, microsecond=0)
    rows, _, _ = parse_feed(calendar_bytes(start), settings)
    assert len(rows) == 3
    assert parse_feed(b"\xef\xbb\xbf" + calendar_bytes(start), settings)[0] == rows
    assert rows[0]["starts_at"].tzinfo is not None
    assert any(row["title"] == "Testvorlesung · R101" for row in rows)
    assert any(row["starts_at"] == start + timedelta(weeks=2, hours=2) for row in rows)
    assert len(parse_feed(calendar_bytes(start, cancelled=True), settings)[0]) == 2
    for bad in (b"<html>Login</html>", calendar_bytes(start).replace(b"FREQ=WEEKLY", b"FREQ=SECONDLY")):
        with pytest.raises(ConnectionError):
            parse_feed(bad, settings)
    assert normalize_feed_url("webcal://calendar.example.test/feed.ics").startswith("https://")


def test_timetable_api_subscribe_refresh_failure_preserves_events_and_disconnect(settings, factory, coordinator,
                                                                                memory_vault, monkeypatch):
    start = datetime.now(UTC).replace(hour=8, minute=0, second=0, microsecond=0)
    state = {"raw": calendar_bytes(start)}
    monkeypatch.setattr("app.calendar.service.read_feed", lambda _url: state["raw"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        result = client.post("/api/timetable/subscribe", json={"url": "https://calendar.example.test/feed?Session=synthetic-private", "name": "Testkalender"})
        assert result.status_code == 200, result.text
        assert result.json()["event_count"] == 3
        assert result.json()["session_link"] is True
        with factory() as session:
            original_id = session.scalar(select(CalendarEvent.id).where(CalendarEvent.title.contains("R101")))
        assert "synthetic-private" not in (settings.local_dir / "timetable-connection.json").read_text()
        assert "synthetic-private" not in client.get("/api/timetable/status").text
        state["raw"] = calendar_bytes(start, room="R202")
        assert client.post("/api/timetable/sync").status_code == 200
        with factory() as session:
            assert session.get(CalendarEvent, original_id).title.endswith("R202")
        state["raw"] = b"<html>Session expired</html>"
        assert client.post("/api/timetable/sync").status_code == 400
        assert len(client.get(f"/api/timetable/events?day={start.date()}").json()) == 1
        assert client.get("/api/timetable/status").json()["last_error"]
        assert client.delete("/api/timetable/subscription").status_code == 200
        assert not client.get(f"/api/timetable/events?day={start.date()}").json()


def test_calendar_redirect_cannot_fetch_a_local_service(monkeypatch):
    from app.calendar.service import read_feed
    calls = []

    def handle(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={"Location": "https://127.0.0.1/private"})

    monkeypatch.setattr("app.portals.public_periods._resolves_to_public_address", lambda host: True)
    fake_client(monkeypatch, handle)
    with pytest.raises(ConnectionError):
        read_feed("https://calendar.example.test/feed.ics")
    assert len(calls) == 1


def test_microsoft_consent_pages_refresh_read_only_and_dedup(settings, factory, coordinator, memory_vault, monkeypatch):
    due = (datetime.now(UTC) + timedelta(days=7)).date()
    calls = []
    counters = {"pages": 0}

    def handle(request):
        calls.append((request.method, request.url.host, request.url.path))
        if request.url.path.endswith("/devicecode"):
            return httpx.Response(200, json={"device_code": "synthetic-device", "user_code": "TEST-CODE",
                                            "interval": 5, "expires_in": 900})
        if request.url.path.endswith("/token"):
            fields = parse_qs(request.content.decode())
            assert "mail.send" not in fields.get("scope", [""])[0].casefold()
            return httpx.Response(200, json={"access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
                                            "scope": "Mail.Read offline_access", "expires_in": 3600})
        assert request.method == "GET" and request.url.host == "graph.microsoft.com"
        assert request.headers["authorization"] == "Bearer synthetic-access"
        counters["pages"] += 1
        item = {"id": "synthetic-mail", "internetMessageId": "<synthetic@example.test>", "subject": "Testfrist",
                "from": {"emailAddress": {"address": "office@example.test"}},
                "receivedDateTime": datetime.now(UTC).isoformat(),
                "body": {"contentType": "text", "content": f"Bitte bis zum {due:%d.%m.%Y} anmelden."}}
        return httpx.Response(200, json={"value": [item], **({"@odata.nextLink": f"{GRAPH}/me/messages?$skiptoken=synthetic"}
                                                           if counters["pages"] % 2 else {})})

    fake_client(monkeypatch, handle)
    service = MailService(settings, factory, coordinator)
    login = service.begin("00000000-0000-0000-0000-000000000001")
    assert "device_code" not in login
    assert service.poll()["connected"] is False  # Respect Microsoft's polling interval.
    service.pending["next_poll"] = 0
    assert service.poll()["connected"] is True
    assert service.sync()["created"] == 1
    tokens = service.vault.read("tokens")
    tokens["expires_at"] = 0
    service.vault.save("tokens", tokens)
    assert service.sync()["created"] == 0
    with factory() as session:
        mail = session.scalar(select(MailItem))
        assert mail.candidate_date == due
        assert mail.status == "proposed"
    public_state = json.dumps(service.store.read())
    assert "synthetic-refresh" not in public_state
    assert all(method == "GET" for method, host, _ in calls if host == "graph.microsoft.com")
    service.disconnect()
    assert service.status()["connected"] is False
    assert not memory_vault


def test_mail_permission_denied_and_foreign_nextlink_do_not_import(settings, factory, coordinator, memory_vault, monkeypatch):
    service = MailService(settings, factory, coordinator)
    with pytest.raises(ConnectionError):
        service._save_tokens({"access_token": "synthetic", "refresh_token": "synthetic", "scope": "User.Read"}, "fixture")
    service.store.save({"institution": settings.institution_slug, "connected": True})
    service.vault.save("tokens", {"access_token": "synthetic", "expires_at": 9999999999})
    fake_client(monkeypatch, lambda request: httpx.Response(200, json={"value": [], "@odata.nextLink": "https://other.example.test/steal"}))
    with pytest.raises(ConnectionError):
        service.sync()
    with factory() as session:
        assert not session.scalar(select(MailItem))


def test_personal_sources_do_not_run_without_host_or_during_quiet_hours(settings, coordinator):
    calls = []

    class FakeSource:
        def status(self):
            return {"connected": True, "subscribed": True}

        def sync(self):
            calls.append("sync")

    scheduler = SyncScheduler(None, settings, coordinator, FakeSource(), FakeSource())
    scheduler._outside_quiet_hours = lambda now: now + timedelta(hours=1)
    scheduler._run_personal_sources()
    assert not calls
    scheduler._outside_quiet_hours = lambda now: now
    coordinator.close()
    scheduler._run_personal_sources()
    assert not calls
