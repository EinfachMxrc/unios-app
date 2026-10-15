# SPDX-License-Identifier: AGPL-3.0-or-later

"""Selected synthetic mail must never add a deadline without confirmation."""

from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from email.utils import format_datetime

from fastapi.testclient import TestClient

from app.mail.ingest import MailParseError, parse_eml, sender_matches
from app.main import create_app


def _mail(days: int = 10) -> bytes:
    due = (datetime.now(UTC) + timedelta(days=days)).date()
    message = EmailMessage()
    message["From"] = "Pruefungsbuero <office@example.test>"
    message["To"] = "student@example.test"
    message["Subject"] = "Erfundene Prüfungsfrist"
    message["Date"] = format_datetime(datetime.now(UTC))
    message.set_content(f"Die Frist endet bis zum {due:%d.%m.%Y}. Bitte selbst im Portal prüfen.")
    return message.as_bytes()


def test_mail_sender_rules_are_exact_and_mail_is_bounded():
    assert sender_matches("office@example.test", ["@example.test"])
    assert not sender_matches("office@fakeexample.test", ["@example.test"])
    assert parse_eml(_mail(), ["@example.test"], require_rule=True).candidate_date is not None
    try:
        parse_eml(_mail(), ["@elsewhere.test"], require_rule=True)
    except MailParseError:
        pass
    else:
        raise AssertionError("unlisted sender must be rejected by automatic ingestion")


def test_mail_import_suggests_only_and_confirmation_creates_one_deadline(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    raw = _mail()
    with TestClient(app) as client:
        imported = client.post("/api/mail/import", files={"file": ("sample.eml", raw, "message/rfc822")})
        assert imported.status_code == 200, imported.text
        mail_id = imported.json()["id"]
        assert imported.json()["candidate_date"]
        assert client.post("/api/mail/import", files={"file": ("sample.eml", raw, "message/rfc822")}).json()["created"] is False
        listed = client.get("/api/mail")
        assert listed.headers["cache-control"] == "private, no-store"
        assert listed.json()[0]["status"] == "proposed"
        assert "Bitte selbst" not in str(listed.json())
        assert not any(item["title"] == "Erfundene Prüfungsfrist" for item in client.get("/api/deadlines").json()["deadlines"])
        assert any(item["kind"] == "mail" and "Erfundene" not in item["summary"]
                   for item in client.get("/api/activity").json()["changes"])
        assert client.post(f"/api/mail/{mail_id}/confirm", json={
            "title": "Geprüfte Frist", "due_at": "2026-10-14T12:00:00",
        }).status_code == 400
        confirmed = client.post(f"/api/mail/{mail_id}/confirm", json={
            "title": "Geprüfte Frist", "due_at": (datetime.now(UTC) + timedelta(days=10)).isoformat(),
        })
        assert confirmed.status_code == 200, confirmed.text
        assert client.post(f"/api/mail/{mail_id}/confirm", json={
            "title": "Doppelt", "due_at": (datetime.now(UTC) + timedelta(days=10)).isoformat(),
        }).status_code == 409
        assert sum(item["title"] == "Geprüfte Frist" for item in client.get("/api/deadlines").json()["deadlines"]) == 1
