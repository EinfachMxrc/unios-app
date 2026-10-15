# SPDX-License-Identifier: AGPL-3.0-or-later

"""A stored session reads only unambiguous, same-host portal pages."""

from datetime import UTC, datetime

import httpx

from app.portals.discovery import discover_pages
from app.portals.read_client import PortalReadClient
from app.portals.session import PortalSession


def test_discovery_follows_only_named_read_pages():
    base = "https://portal.example.invalid/"
    entry = base + "start?Session=fictional"
    seen = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        html = {
            "/start": ('<a href="/exams">Prüfungsübersicht</a>'
                       '<a href="/grades">Notenübersicht</a>'
                       '<a href="/send">Jetzt anmelden</a>'
                       '<a href="https://other.invalid/news">Rückmeldung</a>'),
            "/exams": "<p>Erfundene Prüfung</p>",
            "/grades": "<p>Erfundene Note</p>",
        }[request.url.path]
        return httpx.Response(200, headers={"content-type": "text/html"}, text=html)

    session = PortalSession("primuss", entry, {"cookies": []}, datetime.now(UTC))
    with (httpx.Client(transport=httpx.MockTransport(reply)) as http,
          PortalReadClient(base, session, client=http) as reader):
        pages = discover_pages(reader, "primuss")
    assert [kind for kind, _ in pages] == ["start", "exams", "grades"]
    assert seen == ["/start", "/exams", "/grades"]


def test_mycampus_finds_timetable_from_unique_study_program_link():
    base = "https://portal.example.invalid/"
    seen = []

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        html = {
            "/": '<a href="/study">Mein Studiengang</a><a href="/events">Veranstaltungskalender</a>',
            "/study": '<a href="/schedule">Stundenplan</a><a href="/submit">Jetzt anmelden</a>',
            "/schedule": "<p>Erfundener Stundenplan</p>",
            "/events": "<p>Erfundene Veranstaltung</p>",
        }[request.url.path]
        return httpx.Response(200, headers={"content-type": "text/html"}, text=html)

    session = PortalSession("mycampus", base, {"cookies": []}, datetime.now(UTC))
    with (httpx.Client(transport=httpx.MockTransport(reply)) as http,
          PortalReadClient(base, session, client=http) as reader):
        pages = discover_pages(reader, "mycampus")
    assert [kind for kind, _ in pages] == ["start", "study_program", "timetable", "events"]
    assert seen == [("GET", "/"), ("GET", "/study"), ("GET", "/schedule"), ("GET", "/events")]
