# SPDX-License-Identifier: AGPL-3.0-or-later

"""Profile-driven, GET-only mycampus timetable, events and news."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from threading import Lock
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from bs4.element import Tag
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from soupsieve.util import SelectorSyntaxError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import CalendarEvent, CampusNews, ConnectorHealth, utc_now
from app.host.lease import HostCoordinator
from app.institutions import load_institution
from app.portals.read_client import (
    PortalLoginRequired,
    PortalReadClient,
    PortalReadError,
)
from app.portals.sample import PortalSampleError, load_alias_map, resolve_selectors
from app.portals.session import load_session, valid_portal_url
from app.timeutil import as_utc

GROUPS = {
    "timetable": ("timetable_link", "timetable", "timetable_key_attr", "timetable_title", "timetable_start"),
    "events": ("events_link", "events", "events_key_attr", "events_title", "events_start"),
    "news": ("news_link", "news", "news_key_attr", "news_title"),
}
MAX_ROWS = 200
SYNC_LOCK = Lock()


class CampusNotConfigured(ValueError):
    """The local profile has not been checked against anonymized pages."""


class CampusSyncBusy(RuntimeError):
    """A manual or scheduled read is already in progress."""


@dataclass(frozen=True)
class CampusEventRow:
    source: str
    source_key: str
    title: str
    starts_at: datetime
    ends_at: datetime | None


@dataclass(frozen=True)
class CampusNewsRow:
    source_key: str
    title: str
    published_at: datetime | None


class CampusStatus(BaseModel):
    timetable_available: bool
    events_available: bool
    news_available: bool
    session_available: bool
    alias_map_available: bool
    connection_state: str
    last_attempt_at: datetime | None
    last_success_at: datetime | None


class CampusReport(BaseModel):
    events_created: int
    events_updated: int
    news_created: int
    news_updated: int
    skipped: int
    warnings: list[str]


class CampusNewsView(BaseModel):
    id: int
    title: str
    published_at: datetime | None
    checked_at: datetime


def _valid_key_attr(value: str | None) -> bool:
    return bool(value == "id" or (value and re.fullmatch(r"data-[a-z0-9-]{1,50}", value)))


def group_configured(selectors: dict[str, str | None], group: str) -> bool:
    return all(selectors.get(field) for field in GROUPS[group]) and _valid_key_attr(selectors.get(f"{group}_key_attr"))


def _text(row: Tag, selector: str | None) -> str | None:
    element = row.select_one(selector) if selector else None
    if element is None:
        return None
    return " ".join(element.stripped_strings).strip() or None


def _date(row: Tag, selector: str | None) -> datetime | None:
    element = row.select_one(selector) if selector else None
    raw = element.get("datetime") if element else None
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else None


def _identity(row: Tag, attr: str, kind: str) -> str | None:
    raw = row.get(attr)
    if (not isinstance(raw, str) or not 1 <= len(raw.strip()) <= 200
            or re.search(r"(?i)(?:session|user|token)=", raw)):
        return None
    return kind + ":" + sha256(raw.strip().encode("utf-8")).hexdigest()


def _instant(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return as_utc(value).astimezone(UTC)


def _rows(html: str, selector: str | None, kind: str) -> list[Tag]:
    found = BeautifulSoup(html, "html.parser").select(selector or "")
    if not found or len(found) > MAX_ROWS:
        raise ValueError(f"mycampus-{kind}: Keine eindeutige Liste erkannt; Seitenstruktur prüfen")
    return [row for row in found if isinstance(row, Tag)]


def parse_events(html: str, selectors: dict[str, str | None], kind: str) -> tuple[list[CampusEventRow], list[str]]:
    if kind not in {"timetable", "events"} or not group_configured(selectors, kind):
        raise ValueError("mycampus-Terminselektoren sind unvollständig")
    try:
        parsed: list[CampusEventRow] = []
        warnings: list[str] = []
        seen: set[str] = set()
        for index, row in enumerate(_rows(html, selectors[kind], kind), start=1):
            key = _identity(row, selectors[f"{kind}_key_attr"] or "", kind)
            if key and key in seen:
                raise ValueError("mycampus-Termine enthalten doppelte Schlüssel")
            if key:
                seen.add(key)
            title = _text(row, selectors[f"{kind}_title"])
            start = _date(row, selectors[f"{kind}_start"])
            end = _date(row, selectors.get(f"{kind}_end"))
            if (not key or not title or len(title) > 500 or start is None
                    or (end is not None and end <= start)):
                warnings.append(f"mycampus-{kind}, Zeile {index}: Schlüssel, Titel oder Zeit unklar; ausgelassen.")
                continue
            parsed.append(CampusEventRow(f"mycampus-{kind}", key, title, start, end))
        if not parsed:
            raise ValueError(f"mycampus-{kind}: Keine vollständig lesbaren Termine")
        return parsed, warnings
    except SelectorSyntaxError as exc:
        raise ValueError("mycampus-Terminselektor ist ungültig") from exc


def parse_news(html: str, selectors: dict[str, str | None]) -> tuple[list[CampusNewsRow], list[str]]:
    if not group_configured(selectors, "news"):
        raise ValueError("mycampus-Newsselektoren sind unvollständig")
    try:
        parsed: list[CampusNewsRow] = []
        warnings: list[str] = []
        seen: set[str] = set()
        for index, row in enumerate(_rows(html, selectors["news"], "news"), start=1):
            key = _identity(row, selectors["news_key_attr"] or "", "news")
            if key and key in seen:
                raise ValueError("mycampus-News enthalten doppelte Schlüssel")
            if key:
                seen.add(key)
            title = _text(row, selectors["news_title"])
            if not key or not title or len(title) > 500:
                warnings.append(f"mycampus-News, Zeile {index}: Schlüssel oder Titel unklar; ausgelassen.")
                continue
            parsed.append(CampusNewsRow(key, title, _date(row, selectors.get("news_published"))))
        if not parsed:
            raise ValueError("mycampus-News: Keine vollständig lesbaren Einträge")
        return parsed, warnings
    except SelectorSyntaxError as exc:
        raise ValueError("mycampus-Newsselektor ist ungültig") from exc


def _linked_page(entry: str, selector: str, reader: PortalReadClient, base_url: str) -> str:
    try:
        link = BeautifulSoup(entry, "html.parser").select_one(selector)
    except SelectorSyntaxError as exc:
        raise ValueError("mycampus-Linkselektor ist ungültig") from exc
    href = link.get("href") if link else None
    if not isinstance(href, str) or not valid_portal_url(urljoin(reader.entry_url, href), base_url):
        raise ValueError("mycampus-Link fehlt oder verlässt die erlaubte Adresse")
    return reader.get_html(href)


def store_campus_rows(session: Session, events: list[CampusEventRow],
                      news: list[CampusNewsRow]) -> tuple[int, int, int, int]:
    event_created = event_updated = news_created = news_updated = 0
    for row in events:
        item = session.scalar(select(CalendarEvent).where(
            CalendarEvent.source == row.source, CalendarEvent.source_key == row.source_key))
        if item is None:
            item = CalendarEvent(source=row.source, source_key=row.source_key, course_id=None)
            session.add(item)
            event_created += 1
        elif (item.title, _instant(item.starts_at), _instant(item.ends_at)) != (
            row.title, row.starts_at, row.ends_at,
        ):
            event_updated += 1
        item.title, item.starts_at, item.ends_at = row.title, row.starts_at, row.ends_at
        item.url = None  # Portal links can carry credentials and must never be persisted.
    for news_row in news:
        news_item = session.scalar(select(CampusNews).where(CampusNews.source_key == news_row.source_key))
        if news_item is None:
            news_item = CampusNews(source_key=news_row.source_key)
            session.add(news_item)
            news_created += 1
        elif (news_item.title, _instant(news_item.published_at)) != (
            news_row.title, news_row.published_at,
        ):
            news_updated += 1
        news_item.title = news_row.title
        news_item.published_at = news_row.published_at
        news_item.checked_at = utc_now()
    return event_created, event_updated, news_created, news_updated


def campus_configuration(settings: Settings) -> tuple[str, dict[str, str | None], str | None]:
    try:
        profile = load_institution(settings.institution_slug).mycampus
    except (OSError, ValueError) as exc:
        raise CampusNotConfigured("Hochschulprofil nicht verfügbar") from exc
    if profile.base_url is None:
        raise CampusNotConfigured("mycampus-Adresse nicht konfiguriert")
    return str(profile.base_url), profile.selectors, profile.selector_alias_map


def resolved_selectors(selectors: dict[str, str | None], map_id: str | None) -> dict[str, str | None] | None:
    if map_id is None:
        return selectors
    aliases = load_alias_map("mycampus", map_id)
    if aliases is None:
        return None
    try:
        return resolve_selectors(selectors, aliases)
    except PortalSampleError:
        return None


def campus_ready(settings: Settings) -> bool:
    try:
        _, selectors, map_id = campus_configuration(settings)
    except CampusNotConfigured:
        return False
    return any(group_configured(selectors, group) for group in GROUPS) and resolved_selectors(selectors, map_id) is not None


def _record_failure(factory, status: str, message: str) -> None:
    try:
        with factory() as session:
            health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "mycampus"))
            if health is None:
                health = ConnectorHealth(connector="mycampus", consecutive_failures=0)
                session.add(health)
            health.last_attempt_at = utc_now()
            health.consecutive_failures += 1
            health.status = status
            health.message = message
            session.commit()
    except SQLAlchemyError:
        pass  # Keep the original portal error; no URL or private content enters the log.


def run_campus_sync(settings: Settings, factory, coordinator: HostCoordinator) -> CampusReport:
    if not SYNC_LOCK.acquire(blocking=False):
        raise CampusSyncBusy("mycampus wird bereits gelesen")
    try:
        coordinator.assert_writer()
        base_url, selectors, map_id = campus_configuration(settings)
        active = [group for group in GROUPS if group_configured(selectors, group)]
        fields = resolved_selectors(selectors, map_id)
        if not active or fields is None:
            raise CampusNotConfigured("mycampus-Felder sind noch nicht mit anonymisierten Seiten geprüft")
        events: list[CampusEventRow] = []
        news: list[CampusNewsRow] = []
        warnings: list[str] = []
        try:
            stored = load_session("mycampus", base_url)
            if stored is None:
                raise PortalLoginRequired("mycampus-Session fehlt; Anmeldung selbst am Host durchführen")
            with PortalReadClient(base_url, stored) as reader:
                entry = reader.get_html()
                for group in active:
                    html = _linked_page(entry, fields[f"{group}_link"] or "", reader, base_url)
                    if group == "news":
                        news_rows, issues = parse_news(html, fields)
                        news.extend(news_rows)
                    else:
                        event_rows, issues = parse_events(html, fields, group)
                        events.extend(event_rows)
                    warnings.extend(issues)
        except (PortalReadError, ValueError) as exc:
            _record_failure(factory, "login_required" if isinstance(exc, PortalLoginRequired) else "error",
                            "Hochschul-Login erforderlich" if isinstance(exc, PortalLoginRequired)
                            else "mycampus-Seitenstruktur oder Verbindung prüfen")
            raise
        with factory() as session:
            counts = store_campus_rows(session, events, news)
            health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "mycampus"))
            if health is None:
                health = ConnectorHealth(connector="mycampus")
                session.add(health)
            health.last_attempt_at = utc_now()
            health.last_success_at = health.last_attempt_at
            health.consecutive_failures = 0
            health.status = "warning" if warnings else "ok"
            health.message = "Einige mycampus-Zeilen blieben unklar" if warnings else None
            session.commit()
        return CampusReport(events_created=counts[0], events_updated=counts[1],
                            news_created=counts[2], news_updated=counts[3],
                            skipped=len(warnings), warnings=warnings)
    finally:
        SYNC_LOCK.release()


def mycampus_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/mycampus", tags=["mycampus"])

    @router.get("/status", response_model=CampusStatus)
    def status():
        try:
            base_url, selectors, map_id = campus_configuration(settings)
        except CampusNotConfigured as exc:
            raise HTTPException(503, str(exc)) from exc
        available = resolved_selectors(selectors, map_id)
        with factory() as session:
            health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "mycampus"))
            return CampusStatus(
                timetable_available=available is not None and group_configured(selectors, "timetable"),
                events_available=available is not None and group_configured(selectors, "events"),
                news_available=available is not None and group_configured(selectors, "news"),
                session_available=load_session("mycampus", base_url) is not None,
                alias_map_available=map_id is None or load_alias_map("mycampus", map_id) is not None,
                connection_state=health.status if health else "unknown",
                last_attempt_at=health.last_attempt_at if health else None,
                last_success_at=health.last_success_at if health else None,
            )

    @router.post("/sync", response_model=CampusReport)
    def sync():
        try:
            return run_campus_sync(settings, factory, coordinator)
        except (CampusNotConfigured, CampusSyncBusy) as exc:
            raise HTTPException(409, str(exc)) from exc
        except PortalLoginRequired as exc:
            raise HTTPException(409, str(exc)) from exc
        except (PortalReadError, ValueError) as exc:
            raise HTTPException(502, str(exc)) from exc
        except SQLAlchemyError as exc:
            raise HTTPException(503, "mycampus-Daten konnten nicht gespeichert werden") from exc

    @router.get("/news", response_model=list[CampusNewsView])
    def saved_news():
        with factory() as session:
            return session.scalars(select(CampusNews)
                                   .order_by(CampusNews.published_at.desc(), CampusNews.id.desc())
                                   .limit(100)).all()

    return router
