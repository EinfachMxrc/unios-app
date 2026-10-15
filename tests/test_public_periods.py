# SPDX-License-Identifier: AGPL-3.0-or-later

"""Official period parsing and storage use fictional public HTML only."""

from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from icalendar import Calendar
from sqlalchemy import inspect, select

from alembic import command
from app.db.models import ConnectorHealth, PublicSemesterPeriod
from app.db.session import make_engine
from app.main import create_app
from app.notify.service import Notifier
from app.portals.public_periods import _fetch_html, _safe_url, parse_public_periods
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler

URL = "https://www.hs-coburg.example.invalid/semesterzeiten/"


def _fake_resolution(address: str):
    def resolve(_host, _port, *_args, **_kwargs):
        return [(None, None, None, None, (address, 443))]
    return resolve
PAGE = """<html><main><h2>Sommersemester 2026</h2><p>Rückmeldezeitraum</p>
<p>1. Juli 2026 – 31. Juli 2026</p><p>Prüfungsanmeldung</p>
<p>27. April – 6. Mai 2026</p><h2>Wintersemester 2026/27</h2>
<p>Rückmeldezeitraum</p><p>15. Januar 2027 – 15. Februar 2027</p>
<p>Prüfungsanmeldung</p><p>02. November – 11. November 2026</p></main></html>"""


def test_public_periods_parser_rejects_ambiguous_dates_and_unsafe_transport(monkeypatch):
    rows = parse_public_periods(PAGE)
    assert len(rows) == 4
    assert rows[2].ends_on == date(2027, 2, 15)
    with pytest.raises(ValueError):
        parse_public_periods(PAGE.replace("15. Februar 2027", "15. Februar 2028"))
    with pytest.raises(ValueError):
        parse_public_periods(PAGE.replace("</main>",
                                          "<p>Rückmeldezeitraum</p><p>15. Januar 2027 – 16. Februar 2027</p></main>"))
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, headers={"content-type": "text/html"}, text=PAGE)

    # The fixture domain is a reserved .invalid TLD and cannot really resolve;
    # pin it to a fictional public address so the DNS-rebinding guard passes.
    monkeypatch.setattr("app.portals.public_periods.socket.getaddrinfo", _fake_resolution("93.184.216.34"))
    with httpx.Client(transport=httpx.MockTransport(reply)) as client:
        assert "Wintersemester" in _fetch_html(client, URL)
        with pytest.raises(ValueError):
            _fetch_html(client, "http://127.0.0.1/private")
    assert len(seen) == 1 and seen[0].method == "GET"


def test_public_periods_rejects_hostname_that_resolves_to_loopback(monkeypatch):
    monkeypatch.setattr("app.portals.public_periods.socket.getaddrinfo", _fake_resolution("127.0.0.1"))
    assert _safe_url("https://rebind.example.invalid/semesterzeiten/") is False


def test_public_periods_rejects_hostname_that_fails_to_resolve(monkeypatch):
    def raise_gaierror(*_args, **_kwargs):
        raise OSError("name or service not known")
    monkeypatch.setattr("app.portals.public_periods.socket.getaddrinfo", raise_gaierror)
    assert _safe_url(URL) is False


def test_public_periods_migration_on_empty_fixture_database(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    try:
        columns = {column["name"] for column in inspect(engine).get_columns("public_semester_periods")}
        assert {"semester", "kind", "starts_on", "ends_on", "source_url"} <= columns
    finally:
        engine.dispose()


def test_public_periods_manual_and_daily_sync_keep_date_precision(settings, factory, coordinator, monkeypatch):
    configured = settings.model_copy(update={"public_periods_enabled": True})
    monkeypatch.setattr("app.portals.public_periods.load_institution",
                        lambda _slug: SimpleNamespace(public_deadline_urls=[URL]))
    page = [PAGE]
    monkeypatch.setattr("app.portals.public_periods._fetch_html", lambda _client, _url: page[0])
    app = create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        first = client.post("/api/public-periods/recheck")
        assert first.status_code == 200 and first.json() == {"checked": 4, "created": 4, "updated": 0}
        second = client.post("/api/public-periods/recheck")
        assert second.status_code == 200 and second.json()["created"] == 0
        status = client.get("/api/public-periods").json()
        assert status["state"] == "ok" and status["last_success_at"]
        assert any(row["ends_on"] == "2027-02-15" for row in status["periods"])
        calendar = Calendar.from_ical(client.get("/calendar.ics").content)
        public = [event for event in calendar.walk("VEVENT") if str(event.get("uid")).startswith("public-period-")]
        assert len(public) == 4
        assert all(type(event.decoded("dtstart")) is date for event in public)
        page[0] = PAGE.replace("15. Februar 2027", "16. Februar 2027")
        assert client.post("/api/public-periods/recheck").json()["updated"] == 1
        page[0] = "<main>Seite im Umbau</main>"
        assert client.post("/api/public-periods/recheck").status_code == 502
        assert client.get("/api/public-periods").json()["state"] == "error"
    with factory() as db:
        assert db.scalar(select(PublicSemesterPeriod).where(
            PublicSemesterPeriod.semester == "Wintersemester 2026/27",
            PublicSemesterPeriod.kind == "enrollment")).ends_on == date(2027, 2, 16)
        health = db.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "public-semester"))
        assert health and health.last_success_at is not None
        health.last_attempt_at -= timedelta(days=1)
        db.commit()
    page[0] = PAGE
    scheduler = SyncScheduler(SyncEngine(factory, configured, [], Notifier(configured, coordinator), coordinator),
                              configured, coordinator)
    scheduler._run_public_periods()
    with factory() as db:
        assert db.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "public-semester")).status == "ok"
    assert "public-periods-sync" in (settings.local_dir / "host-actions.jsonl").read_text(encoding="utf-8")
