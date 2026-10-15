# SPDX-License-Identifier: AGPL-3.0-or-later

"""The fake portal cannot pay, report enrollment, or silently clear a deadline."""

from pathlib import Path
from types import SimpleNamespace

import httpx
from alembic.config import Config
from fastapi.testclient import TestClient
from icalendar import Calendar
from sqlalchemy import inspect, select

from alembic import command
from app.calendar.feed import build_calendar
from app.db.models import Deadline, EnrollmentCheck, Notification
from app.db.session import make_engine
from app.main import create_app
from app.notify.service import Notifier
from app.portals.read_client import PortalReadClient
from app.portals.session import validate_session

BASE = "https://portal.example.invalid/"
SELECTORS = {
    "enrollment_link": "a.enrollment", "enrollment": "tr.term",
    "enrollment_key_attr": "id", "enrollment_title": ".name",
    "enrollment_status": ".status", "enrollment_deadline": "time.deadline",
    "enrollment_complete_text": "Rueckgemeldet", "enrollment_open_text": "Offen",
}
OPEN = """<table><tr class="term" id="term-27"><td class="name">Fiktives Semester</td>
<td class="status">Offen</td><td><time class="deadline"
datetime="2027-03-15T23:59:00+01:00">15. März</time></td></tr></table>"""


def test_enrollment_migration_on_empty_fixture_database(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    try:
        columns = {column["name"] for column in inspect(engine).get_columns("enrollment_checks")}
        assert {"source_key", "status", "deadline_at", "checked_at"} <= columns
    finally:
        engine.dispose()


def test_enrollment_recheck_preserves_uncertain_deadline_then_closes_on_explicit_status(
    settings, factory, coordinator, monkeypatch,
):
    selectors = dict(SELECTORS)
    selectors["enrollment"] = None
    monkeypatch.setattr("app.portals.primuss.load_institution",
                        lambda _slug: SimpleNamespace(primuss=SimpleNamespace(
                            base_url=BASE, selectors=selectors, selector_alias_map=None)))
    stored = validate_session("primuss", BASE, BASE + "start?Session=fictional-secret",
                              {"cookies": [], "origins": []})
    monkeypatch.setattr("app.portals.primuss.load_session", lambda _portal, _base: stored)
    html = [OPEN]
    seen: list[httpx.Request] = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        body = '<a class="enrollment" href="/enrollment">Rückmeldung</a>' if request.url.path == "/start" else html[0]
        return httpx.Response(200, headers={"content-type": "text/html"}, text=body)

    monkeypatch.setattr("app.portals.primuss.PortalReadClient",
                        lambda base, session: PortalReadClient(
                            base, session, client=httpx.Client(transport=httpx.MockTransport(reply))))
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/primuss/status").json()["enrollment_available"] is False
        assert client.post("/api/primuss/enrollment/recheck").status_code == 409
        selectors["enrollment"] = SELECTORS["enrollment"]
        assert client.get("/api/primuss/status").json()["enrollment_available"] is True
        first = client.post("/api/primuss/enrollment/recheck")
        assert first.status_code == 200, first.text
        assert first.json()["rows"][0]["status"] == "open"
        assert first.headers["cache-control"] == "private, no-store"
        assert client.get("/api/deadlines").json()["deadlines"][0]["title"] == "Rückmeldung: Fiktives Semester"
        with factory() as db:
            deadline_id = db.scalar(select(Deadline.id).where(Deadline.source == "primuss-enrollment"))
            assert deadline_id is not None
            Notifier.enqueue(db, f"deadline:{deadline_id}:3:2027-03-12",
                             "Frist nähert sich", "Neutrale Erinnerung")
            db.commit()
        html[0] = OPEN.replace("Offen", "Zahlung wird geprüft").replace(
            'datetime="2027-03-15T23:59:00+01:00"', 'datetime="unklar"')
        unclear = client.post("/api/primuss/enrollment/recheck")
        assert unclear.status_code == 200 and unclear.json()["rows"][0]["status"] == "unclear"
        assert len(unclear.json()["warnings"]) == 2
        assert len(client.get("/api/deadlines").json()["deadlines"]) == 1
        html[0] = OPEN.replace("Offen", "Rueckgemeldet")
        complete = client.post("/api/primuss/enrollment/recheck")
        assert complete.status_code == 200 and complete.json()["rows"][0]["status"] == "complete"
        assert client.get("/api/deadlines").json()["deadlines"] == []
    sent: list[httpx.Request] = []

    def send(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200)

    configured = settings.model_copy(update={"ntfy_url": "https://notify.example.invalid/ntfy"})
    Notifier(configured, coordinator, client=httpx.Client(transport=httpx.MockTransport(send))).deliver_pending(factory)
    assert sent == []
    assert [request.method for request in seen] == ["GET"] * 6
    assert all(request.url.host == "portal.example.invalid" for request in seen)
    with factory() as db:
        checks = db.scalars(select(EnrollmentCheck).order_by(EnrollmentCheck.id)).all()
        assert [check.status for check in checks] == ["open", "unclear", "complete"]
        assert all("term-27" not in check.source_key for check in checks)
        deadline = db.scalar(select(Deadline).where(Deadline.source == "primuss-enrollment"))
        assert deadline and deadline.removed_upstream and deadline.url is None
        assert db.scalar(select(Notification)).sent_at is None
        events = Calendar.from_ical(build_calendar(db)).walk("VEVENT")
        assert not any(str(item.get("summary")).startswith("Rückmeldung") for item in events)
