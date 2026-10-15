# SPDX-License-Identifier: AGPL-3.0-or-later

"""mycampus reads only fictional pages and keeps calendar entries distinct."""

from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import httpx
from alembic.config import Config
from fastapi.testclient import TestClient
from icalendar import Calendar
from sqlalchemy import inspect, select

from alembic import command
from app.db.models import CalendarEvent, CampusNews, ConnectorHealth, Notification
from app.db.session import make_engine
from app.main import create_app
from app.notify.service import Notifier
from app.portals.read_client import PortalReadClient
from app.portals.session import validate_session
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler

BASE = "https://campus.example.invalid/"
SELECTORS = {
    "timetable_link": "a.timetable", "timetable": "tr.session", "timetable_key_attr": "id",
    "timetable_title": ".title", "timetable_start": "time.start", "timetable_end": "time.end",
    "events_link": "a.events", "events": "article.event", "events_key_attr": "id",
    "events_title": ".title", "events_start": "time.start",
    "news_link": "a.news", "news": "article.news", "news_key_attr": "id",
    "news_title": ".title", "news_published": "time.published",
}
TIMETABLE = """<table><tr class="session" id="session-1"><td class="title">Fiktive Vorlesung</td>
<td><time class="start" datetime="2027-01-11T09:00:00+01:00"></time></td>
<td><time class="end" datetime="2027-01-11T10:30:00+01:00"></time></td></tr></table>"""
EVENTS = """<article class="event" id="event-1"><h2 class="title">Fiktiver Infoabend</h2>
<time class="start" datetime="2027-01-12T17:00:00+01:00"></time></article>"""
NEWS = """<article class="news" id="news-1"><h2 class="title">Fiktive Nachricht</h2>
<time class="published" datetime="2027-01-10T08:00:00+01:00"></time></article>"""


def test_campus_news_migration_on_empty_fixture_database(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    try:
        columns = {column["name"] for column in inspect(engine).get_columns("campus_news")}
        assert {"source_key", "title", "published_at", "checked_at"} <= columns
    finally:
        engine.dispose()


def test_campus_sync_is_get_only_idempotent_and_deduplicates_moodle(
    settings, factory, coordinator, monkeypatch,
):
    selectors = dict(SELECTORS)
    selectors["timetable"] = None
    monkeypatch.setattr("app.portals.mycampus.load_institution",
                        lambda _slug: SimpleNamespace(mycampus=SimpleNamespace(
                            base_url=BASE, selectors=selectors, selector_alias_map=None)))
    stored = validate_session("mycampus", BASE, BASE + "start", {
        "cookies": [{"name": "portal", "value": "fictional",
                     "domain": "campus.example.invalid", "path": "/"}], "origins": [],
    })
    monkeypatch.setattr("app.portals.mycampus.load_session", lambda _portal, _base: stored)
    news_html = [NEWS]
    seen: list[httpx.Request] = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        pages = {"/start": '<a class="timetable" href="/timetable">Plan</a>'
                           '<a class="events" href="/events">Termine</a>'
                           '<a class="news" href="/news">News</a>',
                 "/timetable": TIMETABLE, "/events": EVENTS, "/news": news_html[0]}
        return httpx.Response(200, headers={"content-type": "text/html"}, text=pages[request.url.path])

    monkeypatch.setattr("app.portals.mycampus.PortalReadClient",
                        lambda base, session: PortalReadClient(
                            base, session, client=httpx.Client(transport=httpx.MockTransport(reply))))
    with factory() as db:
        db.add(CalendarEvent(source="moodle", source_key="moodle-1", title="Fiktive Vorlesung",
                             starts_at=datetime.fromisoformat("2027-01-11T08:00:00+00:00")))
        db.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/mycampus/status").json()["timetable_available"] is False
        first = client.post("/api/mycampus/sync")
        assert first.status_code == 200, first.text
        assert first.json()["events_created"] == 1 and first.json()["news_created"] == 1
        selectors["timetable"] = SELECTORS["timetable"]
        second = client.post("/api/mycampus/sync")
        assert second.status_code == 200, second.text
        assert second.json()["events_created"] == 1 and second.json()["news_created"] == 0
        assert second.headers["cache-control"] == "private, no-store"
        assert client.get("/api/mycampus/news").json()[0]["title"] == "Fiktive Nachricht"
        visible = client.get("/api/deadlines").json()["events"]
        assert [item["title"] for item in visible] == ["Fiktive Vorlesung", "Fiktiver Infoabend"]
        calendar = Calendar.from_ical(client.get("/calendar.ics").content)
        assert [str(item.get("summary")) for item in calendar.walk("VEVENT")].count("Fiktive Vorlesung") == 1
        again = client.post("/api/mycampus/sync")
        assert again.status_code == 200 and again.json()["events_updated"] == 0
        news_html[0] = NEWS.replace("Fiktive Nachricht", "Aktualisierte fiktive Nachricht")
        changed = client.post("/api/mycampus/sync")
        assert changed.json()["news_updated"] == 1
    assert all(request.method == "GET" and request.url.host == "campus.example.invalid" for request in seen)
    with factory() as db:
        rows = db.scalars(select(CalendarEvent).where(CalendarEvent.source.like("mycampus-%"))).all()
        assert len(rows) == 2 and all(row.url is None for row in rows)
        news = db.scalar(select(CampusNews))
        assert news and news.title == "Aktualisierte fiktive Nachricht"
        assert "news-1" not in news.source_key

    notifier = Notifier(settings, coordinator)
    engine = SyncEngine(factory, settings, [], notifier, coordinator)
    scheduler = SyncScheduler(engine, settings, coordinator)
    scheduler._run_campus()
    with factory() as db:
        health = db.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "mycampus"))
        assert health and health.status == "ok" and health.last_success_at is not None
        assert db.query(CalendarEvent).filter(CalendarEvent.source.like("mycampus-%")).count() == 2

    requests_before_login_loss = len(seen)
    monkeypatch.setattr("app.portals.mycampus.load_session", lambda _portal, _base: None)
    scheduler._run_campus()
    with factory() as db:
        health = db.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "mycampus"))
        notices = db.scalars(select(Notification).where(Notification.event_key.like("connector:mycampus:%"))).all()
        assert health and health.status == "login_required" and health.last_success_at is not None
        assert len(notices) == 1 and "Session" not in notices[0].body
    assert len(seen) == requests_before_login_loss
    assert "mycampus-sync" in (settings.local_dir / "host-actions.jsonl").read_text(encoding="utf-8")
