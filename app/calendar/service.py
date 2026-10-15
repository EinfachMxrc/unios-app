# SPDX-License-Identifier: AGPL-3.0-or-later
"""Private iCal subscriptions, with recurrence, exceptions and cancelled classes."""

from datetime import UTC, date, datetime, time, timedelta
from hashlib import sha256
from threading import Lock
from urllib.parse import parse_qs, urljoin, urlsplit

import httpx
import recurring_ical_events
from icalendar import Calendar

from app.calendar.edit_service import CalendarEdits
from app.calendar.repository import TimetableRepository
from app.calendar.selection import TimetableSelection, slot
from app.config import Settings
from app.integrations.storage import ConnectionError, ConnectionStore, Vault
from app.portals.public_periods import _safe_url

MAX_FEED_BYTES = 2_000_000
MAX_EVENTS = 3000


def normalize_feed_url(value: str) -> str:
    value = value.strip()
    if value.startswith("webcal://"):
        value = "https://" + value[len("webcal://"):]
    try:
        parsed = urlsplit(value)
        if (len(value) > 8000 or any(ord(char) < 33 for char in value)
                or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.port not in {None, 443} or parsed.fragment):
            raise ValueError
    except ValueError as exc:
        raise ConnectionError("Bitte einen gültigen HTTPS- oder webcal-Kalenderlink eingeben") from exc
    return value


def read_feed(url: str) -> bytes:
    with httpx.Client(timeout=20, follow_redirects=False) as client:
        for _ in range(4):
            if not _safe_url(url):
                raise ConnectionError("Kalenderadresse ist nicht öffentlich erreichbar oder nicht erlaubt")
            with client.stream("GET", url, headers={"Accept": "text/calendar"}) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    url = normalize_feed_url(urljoin(url, response.headers.get("location", "")))
                    continue
                if response.status_code != 200:
                    raise ConnectionError("Stundenplan nicht erreichbar. Kalenderlink oder Anmeldung prüfen.")
                raw = bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw) > MAX_FEED_BYTES:
                        raise ConnectionError("Stundenplan-Kalender ist zu groß")
                return bytes(raw)
    raise ConnectionError("Stundenplan leitet zu oft weiter")


def parse_feed(raw: bytes, settings: Settings, now: datetime | None = None) -> tuple[list[dict], datetime, datetime]:
    raw = raw.removeprefix(b"\xef\xbb\xbf")
    now = now or datetime.now(UTC)
    start = datetime.combine((now.astimezone(settings.timezone) - timedelta(days=7)).date(),
                             time.min, settings.timezone)
    end = start + timedelta(days=217)
    if len(raw) > MAX_FEED_BYTES or not raw.lstrip().startswith(b"BEGIN:VCALENDAR"):
        raise ConnectionError("Der Link liefert keinen iCal-Kalender. Möglicherweise ist die Sitzung abgelaufen.")
    try:
        calendar = Calendar.from_ical(raw)
        masters = list(calendar.walk("VEVENT"))
        if len(masters) > 500 or calendar.errors:
            raise ValueError
        for component in masters:
            if component.errors or not component.get("UID") or not component.get("DTSTART"):
                raise ValueError
            rule = component.get("RRULE")
            # Timetables repeat at daily/weekly granularity; reject huge second/minute recurrences.
            if rule and str(rule.get("FREQ", [""])[0]) not in {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}:
                raise ValueError
            if rule and any(key in rule for key in ("BYHOUR", "BYMINUTE", "BYSECOND")):
                raise ValueError
        occurrences = recurring_ical_events.of(calendar).between(start, end)
        if len(occurrences) > MAX_EVENTS:
            raise ValueError
        rows: dict[str, dict] = {}
        for component in occurrences:
            if str(component.get("STATUS", "")).upper() == "CANCELLED":
                continue
            title = " ".join(str(component.get("SUMMARY", "")).split())[:400]
            if not title:
                raise ValueError
            location = " ".join(str(component.get("LOCATION", "")).split())[:90]
            if location:
                title += " · " + location

            def instant(value) -> datetime:
                if isinstance(value, datetime):
                    return (value if value.tzinfo else value.replace(tzinfo=settings.timezone)).astimezone(UTC)
                if isinstance(value, date):
                    return datetime.combine(value, time.min, settings.timezone).astimezone(UTC)
                raise ValueError

            begins = instant(component.decoded("DTSTART"))
            finishes = instant(component.decoded("DTEND")) if component.get("DTEND") else None
            if finishes and finishes < begins:
                raise ValueError
            recurrence = component.decoded("RECURRENCE-ID") if component.get("RECURRENCE-ID") else component.decoded("DTSTART")
            key = sha256(f"{component['UID']}:{instant(recurrence).isoformat()}".encode()).hexdigest()
            rows[key] = {"source_key": key, "title": title, "starts_at": begins, "ends_at": finishes,
                         "course_id": None, "url": None}
        return list(rows.values()), start, end
    except ConnectionError:
        raise
    except Exception as exc:
        raise ConnectionError("Stundenplan konnte nicht eindeutig gelesen werden. Bisherige Termine bleiben erhalten.") from exc


class TimetableService:
    def __init__(self, settings: Settings, factory, coordinator, fetch_feed=None):
        self.settings = settings
        self.coordinator = coordinator
        self.fetch_feed = fetch_feed or read_feed
        self.store = ConnectionStore(settings.local_dir, "timetable")
        self.vault = Vault(settings.local_dir, settings.institution_slug, "timetable")
        self.repository = TimetableRepository(factory)
        self.selection = TimetableSelection(settings)
        self.lock = Lock()
        self.source = "timetable-" + sha256(settings.institution_slug.encode()).hexdigest()[:16]
        self.edits = CalendarEdits(factory, coordinator, self.source, settings.timezone)

    def status(self) -> dict:
        state = self.store.read()
        if state.get("institution") != self.settings.institution_slug:
            state = {}
        return {"subscribed": bool(state.get("subscribed")), "name": state.get("name", ""),
                "keyring_available": self.vault.available(), "last_success_at": state.get("last_success_at"),
                "last_error": state.get("last_error", ""), "event_count": state.get("event_count", 0),
                "session_link": bool(state.get("session_link")), "through": state.get("through")}

    def _refresh(self, url: str, state: dict) -> dict:
        rows, _, end = parse_feed(self.fetch_feed(url), self.settings)
        self.coordinator.assert_writer()
        self.repository.replace(self.source, rows, self.coordinator)
        state.update(last_success_at=datetime.now(UTC).isoformat(), last_error="",
                     event_count=len(rows), through=end.date().isoformat())
        self.store.save(state)
        return self.status()

    def subscribe(self, url: str, name: str) -> dict:
        self.coordinator.assert_writer()
        url = normalize_feed_url(url)
        with self.lock:
            # Validate before replacing a previously working connection.
            rows, _, end = parse_feed(self.fetch_feed(url), self.settings)
            self.coordinator.assert_writer()
            self.vault.save("feed", {"url": url})
            self.repository.replace(self.source, rows, self.coordinator)
            session_link = any(key.casefold() in {"session", "sid", "jsessionid"}
                               for key in parse_qs(urlsplit(url).query))
            self.store.save({"institution": self.settings.institution_slug, "subscribed": True,
                             "name": name, "session_link": session_link, "event_count": len(rows),
                             "last_success_at": datetime.now(UTC).isoformat(), "last_error": "",
                             "through": end.date().isoformat()})
            return self.status()

    def sync(self) -> dict:
        self.coordinator.assert_writer()
        if not self.lock.acquire(blocking=False):
            raise ConnectionError("Stundenplan wird bereits aktualisiert")
        try:
            if not self.status()["subscribed"]:
                raise ConnectionError("Bitte zuerst einen Stundenplan abonnieren")
            state = self.store.read()
            secret = self.vault.read("feed")
            if not secret.get("url"):
                raise ConnectionError("Kalenderlink im Schlüsselbund nicht verfügbar")
            return self._refresh(normalize_feed_url(secret["url"]), state)
        except (ConnectionError, httpx.HTTPError) as exc:
            message = str(exc) if isinstance(exc, ConnectionError) else "Stundenplan-Dienst derzeit nicht erreichbar"
            state = self.store.read()
            state["last_error"] = message
            self.coordinator.assert_writer()
            self.store.save(state)
            raise ConnectionError(message) from None
        finally:
            self.lock.release()

    def disconnect(self) -> None:
        self.coordinator.assert_writer()
        with self.lock:
            self.vault.remove("feed")
            self.repository.stop(self.source, self.coordinator)
            self.store.save({"institution": self.settings.institution_slug, "subscribed": False})

    def events(self, day: date) -> list[dict]:
        start = datetime.combine(day, time.min, self.settings.timezone).astimezone(UTC)
        end = datetime.combine(day + timedelta(days=7), time.min, self.settings.timezone).astimezone(UTC)
        return self.edits.events(start, end, self.selection)

    def slots(self) -> list[dict]:
        rows = self.repository.list_events(self.source, datetime.min.replace(tzinfo=UTC),
                                           datetime.max.replace(tzinfo=UTC))
        hidden = self.selection.hidden()
        slots = {value['id']: {**value, 'visible': value['id'] not in hidden}
                 for row in rows for value in [slot(row, self.settings)]}
        return sorted(slots.values(), key=lambda value: (value['title'], value['weekday'], value['start_time']))

    def select_slot(self, slot_id: str, visible: bool) -> list[dict]:
        self.coordinator.assert_writer()
        with self.lock:
            hidden = self.selection.hidden()
            if slot_id not in {value['id'] for value in self.slots()}:
                raise ConnectionError('Zeitslot nicht mehr im Stundenplan vorhanden; bitte aktualisieren')
            if visible:
                hidden.discard(slot_id)
            else:
                hidden.add(slot_id)
            self.coordinator.assert_writer()
            self.selection.save(hidden)
            return self.slots()
