# SPDX-License-Identifier: AGPL-3.0-or-later
"""Boundary-only fake providers exercise the real mail/calendar API and service."""

from datetime import UTC, datetime, time, timedelta

import httpx

from app.calendar.service import TimetableService
from app.integrations.storage import ConnectionError
from app.mail.service import MailService
from tests.test_personal_sources import calendar_bytes


class MemoryVault:
    def __init__(self):
        self.values = {}

    @staticmethod
    def available():
        return True

    def read(self, alias):
        return self.values.get(alias, {})

    def save(self, alias, value):
        self.values[alias] = value

    def remove(self, alias):
        self.values.pop(alias, None)


def fetch_timetable(url):
    if not url.startswith("https://calendar.example.test/"):
        raise ConnectionError("Nur der erfundene Testkalender ist erlaubt")
    if "expired" in url:
        return b"<html>Expired fixture</html>"
    return calendar_bytes(datetime.combine(teaching_day(datetime.now(UTC)), time(8, 0), tzinfo=UTC))


def teaching_day(now: datetime):
    """Today, or the next Monday at a weekend: the default view is the work week."""
    day = now.date()
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


class FakeTimetableService(TimetableService):
    def __init__(self, settings, factory, coordinator):
        super().__init__(settings, factory, coordinator, fetch_feed=fetch_timetable)
        self.vault = MemoryVault()


def microsoft(request):
    if request.url.path.endswith("/devicecode"):
        return httpx.Response(200, json={"device_code": "synthetic-device", "user_code": "TEST-CODE",
                                        "expires_in": 900, "interval": 5})
    if request.url.path.endswith("/token"):
        return httpx.Response(200, json={"access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
                                        "expires_in": 3600, "scope": "Mail.Read offline_access"})
    if request.url.host == "graph.microsoft.com" and request.method == "GET":
        due = datetime.now(UTC).date() + timedelta(days=8)
        return httpx.Response(200, json={"value": [{"id": "fixture-mail", "internetMessageId": "<fixture@example.test>",
            "subject": "Erfundene Anmeldefrist", "from": {"emailAddress": {"address": "office@example.test"}},
            "receivedDateTime": datetime.now(UTC).isoformat(),
            "body": {"contentType": "text", "content": f"Bitte bis zum {due:%d.%m.%Y} anmelden."}}]})
    raise AssertionError("Unexpected provider operation")


class FakeMailService(MailService):
    def __init__(self, settings, factory, coordinator):
        super().__init__(settings, factory, coordinator,
                         client_factory=lambda **kwargs: httpx.Client(transport=httpx.MockTransport(microsoft), **kwargs))
        self.vault = MemoryVault()

    def status(self):
        value = super().status()
        if not value["client_id"]:
            value["client_id"] = "00000000-0000-0000-0000-000000000001"
        return value
