# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read events, news and documents from mycampus with the user's own saved sign-in.

Every request is a plain GET on the portal's own host. The walk starts at the portal's start
page, follows its main navigation and, for the chosen study programme, that programme's own
pages, and stores what the pages show. Nothing is changed in the portal.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urldefrag, urljoin, urlsplit
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from sqlalchemy import delete, select

from app.connectors.base import RemoteCourse, RemoteResource, RemoteSection
from app.db.models import CalendarEvent, CampusItem, utc_now
from app.portals.campus_extract import (
    CampusCard,
    ProgramLink,
    extract_cards,
    extract_program_page,
    find_navigation,
    find_pagination,
    find_program_links,
)
from app.portals.read_client import PortalLoginRequired, PortalReadError

log = logging.getLogger(__name__)

MAX_PAGES = 300
MAX_LIST_PAGES = 30
MAX_SUBPAGES_PER_ENTRY = 40
MAX_PROGRAM_PAGES = 100
REQUEST_PAUSE_SECONDS = 0.4
EVENT_SOURCE = "mycampus"
# Headings of Drupal comment forms. Older imports took them for event titles on
# detail pages; the extractor now skips them and store() removes what is left.
COMMENT_FORM_TITLES = ("Neuen Kommentar hinzufügen", "Kommentar hinzufügen", "Add new comment")
LIMIT_WARNING = "Der Seitenabruf wurde begrenzt; möglicherweise fehlen weitere Unterseiten."
# Entries that end the session or change something are never opened.
FORBIDDEN = re.compile(r"abmeld|logout|log out|sign out|ausloggen|login|anmelden|passwort|password|"
                       r"l(ö|oe)sch|delete|speichern|save|absenden|bezahl|kommentieren|like|favorit", re.IGNORECASE)
PROGRAM_CHOICE_FILE = "campus.json"


class PageReader(Protocol):
    def get_page(self, target: str | None = None) -> tuple[str, str]: ...

    def get_file(self, target: str, max_bytes: int = ...) -> bytes: ...


class DocumentSink(Protocol):
    def ingest_documents(self, connector: Any, collections: list[RemoteCourse]) -> tuple[int, int]: ...


class CampusImportError(RuntimeError):
    """The import cannot run (for example the saved sign-in has expired)."""


class CampusLoginRequired(CampusImportError):
    """The portal entry still requires the user's own sign-in."""


@dataclass
class ImportReport:
    pages: int = 0
    events: int = 0
    news: int = 0
    documents: int = 0
    files_stored: int = 0
    new_items: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)


def load_program_choice(local_dir: Path) -> dict[str, str] | None:
    try:
        data = json.loads((local_dir / PROGRAM_CHOICE_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    program = data.get("program") if isinstance(data, dict) else None
    if isinstance(program, dict) and isinstance(program.get("name"), str) and isinstance(program.get("url"), str):
        return {"name": program["name"], "url": program["url"]}
    return None


def save_program_choice(local_dir: Path, name: str, url: str) -> None:
    local_dir.mkdir(parents=True, exist_ok=True)
    (local_dir / PROGRAM_CHOICE_FILE).write_text(
        json.dumps({"program": {"name": name, "url": url}}, ensure_ascii=False), encoding="utf-8")


def _fetch(reader: PageReader, url: str, report: ImportReport, sleep: Callable[[float], None],
           session_check_url: str | None = None) -> tuple[str, str] | None:
    sleep(REQUEST_PAUSE_SECONDS)
    try:
        page = reader.get_page(url)
    except PortalLoginRequired:
        if session_check_url is None:
            raise
        # A restricted subpage is not proof that the entire session expired.
        # Recheck the entry page sequentially; never follow a login redirect.
        sleep(REQUEST_PAUSE_SECONDS)
        reader.get_page(session_check_url)
        report.skipped += 1
        report.warnings.append("Eine verlinkte Seite konnte mit der gespeicherten Anmeldung nicht gelesen werden.")
        return None
    except PortalReadError:
        report.skipped += 1
        report.warnings.append("Eine Seite konnte nicht gelesen werden.")
        return None
    report.pages += 1
    return page


def list_programs(reader: PageReader, base_url: str, sleep: Callable[[float], None] = time.sleep) -> list[ProgramLink]:
    """The study programmes the portal lists under "Alle Studiengänge"."""
    report = ImportReport()
    start = _fetch(reader, base_url, report, sleep)
    if start is None:
        raise CampusImportError("Die Startseite von myCampus konnte nicht gelesen werden.")
    entry = next((item for item in find_navigation(*start) if "studieng" in item.text.casefold()
                  and "alle" in item.text.casefold()), None)
    if entry is None:
        return find_program_links(*start)
    page = _fetch(reader, entry.url, report, sleep)
    return find_program_links(*page) if page else []


def _content_links(html: str, page_url: str, prefix: str | None) -> list[str]:
    """Links inside the page content (not the header or footer) that lead to further pages."""
    soup = BeautifulSoup(html, "html.parser")
    root = soup.find("main") or soup.body or soup
    found: list[str] = []
    host = urlsplit(page_url).hostname
    for anchor in root.find_all("a", href=True):
        text = " ".join(anchor.get_text(" ").split())
        absolute = urldefrag(urljoin(page_url, str(anchor["href"])))[0]
        parsed = urlsplit(absolute)
        if parsed.scheme != "https" or parsed.hostname != host or parsed.username or parsed.password:
            continue
        path = parsed.path
        if (not path or path == urlsplit(page_url).path and not parsed.query or not text
                or FORBIDDEN.search(text) or FORBIDDEN.search(absolute)):
            continue
        if (anchor.has_attr("download") or anchor.select_one(".document-content")
                or re.search(r"\.(pdf|docx?|xlsx?|pptx?|zip)$", path, re.IGNORECASE)):
            continue
        if prefix is not None and not (path == prefix or path.startswith(prefix + "/")):
            continue
        if absolute not in found:
            found.append(absolute)
    return found


def collect(reader: PageReader, base_url: str, tz: ZoneInfo, program: dict[str, str] | None,
            report: ImportReport, sleep: Callable[[float], None] = time.sleep) -> list[tuple[CampusCard, str | None]]:
    """Walk the start page, the navigation and the chosen programme; return every card found."""
    cards: list[tuple[CampusCard, str | None]] = []
    visited: set[str] = set()
    cached: dict[str, tuple[str, str]] = {}

    def read(url: str, program_name: str | None) -> tuple[str, str] | None:
        if url in cached:
            cached_page = cached[url]
            if program_name:
                cards.extend((card, program_name) for card in extract_cards(cached_page[0], cached_page[1], tz))
                program_page = extract_program_page(*cached_page)
                if program_page:
                    cards.append((program_page, program_name))
            return cached_page
        if url in visited or report.pages >= MAX_PAGES:
            return None
        visited.add(url)
        page = _fetch(reader, url, report, sleep, session_check_url=base_url if url != base_url else None)
        if page is None:
            return None
        visited.add(page[1])
        cached[url] = cached[page[1]] = page
        cards.extend((card, program_name) for card in extract_cards(page[0], page[1], tz))
        if program_name:
            program_page = extract_program_page(*page)
            if program_page:
                cards.append((program_page, program_name))
        return page

    start = read(base_url, None)
    if start is None:
        raise CampusImportError("Die Startseite von myCampus konnte nicht gelesen werden.")
    if program is not None:
        # Degree pages can contain whole trees of subpages. The first page may also
        # link to a different route for its own documents, so permit those direct
        # children and then remain inside each child's route.
        root_path = urlsplit(program["url"]).path.rstrip("/")
        pending = deque([(program["url"], root_path)])
        queued = {program["url"]}
        program_pages = 0
        while pending and program_pages < MAX_PROGRAM_PAGES and report.pages < MAX_PAGES:
            url, prefix = pending.popleft()
            page = read(url, program["name"])
            if page is None:
                continue
            program_pages += 1
            other_programs = {item.url for item in find_program_links(*page)}
            for link in _content_links(*page, None if url == program["url"] else prefix):
                if link in queued or (link in other_programs and link != program["url"]):
                    continue
                queued.add(link)
                next_prefix = prefix if url == program["url"] and urlsplit(link).path.startswith(root_path + "/") else urlsplit(link).path.rstrip("/")
                pending.append((link, next_prefix))
            for link in find_pagination(*page):
                if link not in queued:
                    queued.add(link)
                    pending.append((link, prefix))
        if pending and LIMIT_WARNING not in report.warnings:
            report.warnings.append(LIMIT_WARNING)
    def read_listing(url: str, name: str | None) -> None:
        """Follow every visible pager step, including pages revealed by later pages."""
        pending = deque([url])
        seen_pages: set[str] = set()
        while pending and len(seen_pages) < MAX_LIST_PAGES and report.pages < MAX_PAGES:
            current = pending.popleft()
            if current in seen_pages:
                continue
            seen_pages.add(current)
            page = read(current, name)
            if page:
                pending.extend(find_pagination(*page))
        if pending and LIMIT_WARNING not in report.warnings:
            report.warnings.append(LIMIT_WARNING)

    for url in find_pagination(*start)[:MAX_LIST_PAGES]:
        read_listing(url, None)
    for entry in find_navigation(*start):
        general_limit = MAX_PAGES
        if FORBIDDEN.search(entry.text) or report.pages >= general_limit:
            continue
        page = read(entry.url, None)
        if page is None or "alle studieng" in entry.text.casefold():
            continue
        for url in find_pagination(*page):
            read_listing(url, None)
        pending_general = deque((link, urlsplit(link).path.rstrip('/'))
                                for link in _content_links(*page, None)
                                if link not in {item.url for item in find_program_links(*page)})
        seen_general: set[str] = set()
        while pending_general and len(seen_general) < MAX_SUBPAGES_PER_ENTRY and report.pages < general_limit:
            link, prefix = pending_general.popleft()
            if link in seen_general:
                continue
            seen_general.add(link)
            subpage = read(link, None)
            if subpage:
                for url in find_pagination(*subpage):
                    read_listing(url, None)
                excluded = {item.url for item in find_program_links(*subpage)}
                pending_general.extend((child, prefix) for child in _content_links(*subpage, prefix)
                                       if child not in seen_general and child not in excluded)
        if pending_general and LIMIT_WARNING not in report.warnings:
            report.warnings.append(LIMIT_WARNING)
    return cards


def store(factory, cards: list[tuple[CampusCard, str | None]], report: ImportReport) -> None:
    """Save the cards; events also become calendar entries. Known items are only refreshed."""
    now = utc_now()
    with factory() as session:
        for card, program_name in cards:
            item = session.scalar(select(CampusItem).where(CampusItem.source_key == card.key))
            if item is None:
                item = CampusItem(source_key=card.key, kind=card.kind, title=card.title, first_seen_at=now)
                session.add(item)
                report.new_items += 1
            item.kind = card.kind
            item.title = card.title
            item.summary = card.summary
            item.url = card.url
            item.category = card.category
            item.published_at = card.published_at
            item.starts_at = card.starts_at
            item.file_label = card.file_label
            item.study_program = program_name or item.study_program
            item.last_seen_at = now
            if card.kind == "event" and card.starts_at is not None:
                event = session.scalar(select(CalendarEvent).where(
                    CalendarEvent.source == EVENT_SOURCE, CalendarEvent.source_key == card.key))
                if event is None:
                    event = CalendarEvent(source=EVENT_SOURCE, source_key=card.key, title=card.title,
                                          starts_at=card.starts_at)
                    session.add(event)
                event.title = card.title
                event.starts_at = card.starts_at
                event.url = card.url or None
        session.execute(delete(CalendarEvent).where(
            CalendarEvent.source == EVENT_SOURCE, CalendarEvent.title.in_(COMMENT_FORM_TITLES)))
        session.execute(delete(CampusItem).where(CampusItem.title.in_(COMMENT_FORM_TITLES)))
        session.commit()
    report.events = sum(1 for card, _ in cards if card.kind == "event")
    report.news = sum(1 for card, _ in cards if card.kind == "news")
    report.documents = sum(1 for card, _ in cards if card.kind == "document")


class CampusFiles:
    """The connector the sync engine stores documents through: it downloads with the saved sign-in."""

    name = EVENT_SOURCE

    def __init__(self, reader: PageReader, pages: dict[str, bytes] | None = None) -> None:
        self.reader = reader
        self.pages = pages or {}

    def download(self, remote: RemoteResource) -> bytes:
        if remote.key in self.pages:
            return self.pages[remote.key]
        return self.reader.get_file(remote.url)


def _file_name(title: str, url: str, file_label: str | None = None) -> str:
    extension = re.search(r"\.[A-Za-z0-9]{2,5}$", urlsplit(url).path)
    label = re.match(r"^(PDF|DOCX?|XLSX?|PPTX?|ZIP)\s*\|", file_label or "", re.IGNORECASE)
    suffix = extension.group(0).lower() if extension else ("." + label.group(1).lower() if label else "")
    return f"{title.replace('/', '-')}{suffix}"


def keep_documents(engine: DocumentSink, reader: PageReader, cards: list[tuple[CampusCard, str | None]],
                   program: dict[str, str] | None, report: ImportReport) -> None:
    """Store programme files separately from campus-wide documents."""
    collections: list[RemoteCourse] = []
    for selected in (None,) + ((program["name"],) if program else ()):
        documents = [card for card, name in cards if card.kind in {"document", "page"} and card.url and name == selected]
        if not documents:
            continue
        key = ("program:" + hashlib.sha256(program["url"].encode()).hexdigest()[:12]
               if selected and program else "general")
        course = RemoteCourse(key=key, name=selected or "myCampus – Dokumente", short_name="myCampus")
        categories = list(dict.fromkeys(card.category or "Sonstiges" for card in documents))
        course.sections = [RemoteSection(key=hashlib.sha256(name.encode()).hexdigest()[:12], name=name, position=index)
                           for index, name in enumerate(categories)]
        section_keys = {section.name: section.key for section in course.sections}
        course.resources = [
            RemoteResource(key=card.key, name=card.title.replace('/', '-') + '.md' if card.kind == 'page' else _file_name(card.title, card.url, card.file_label), url=card.url, kind="file",
                           section_key=section_keys[card.category or "Sonstiges"],
                           modified=int(card.published_at.timestamp()) if card.published_at else None,
                           force_check=card.kind == 'page')
            for card in documents]
        collections.append(course)
    if not collections:
        return
    pages = {card.key: f'# {card.title}\n\n{card.summary}\n'.encode()
             for card, _ in cards if card.kind == 'page'}
    stored, skipped = engine.ingest_documents(CampusFiles(reader, pages), collections)
    report.files_stored = stored
    if skipped:
        report.skipped += skipped
        report.warnings.append(f"{skipped} Dokumente konnten nicht geladen werden.")


def run_import(factory, reader: PageReader, base_url: str, tz: ZoneInfo, local_dir: Path,
               engine: DocumentSink | None = None,
               sleep: Callable[[float], None] = time.sleep) -> ImportReport:
    report = ImportReport()
    program = load_program_choice(local_dir)
    try:
        cards = collect(reader, base_url, tz, program, report, sleep)
    except PortalLoginRequired as exc:
        raise CampusLoginRequired("Die Anmeldung bei myCampus ist abgelaufen. Bitte erneut anmelden.") from exc
    unique: dict[str, tuple[CampusCard, str | None]] = {}
    for card, program_name in cards:
        unique[card.key] = (card, program_name or (unique[card.key][1] if card.key in unique else None))
    store(factory, list(unique.values()), report)
    if engine is not None:
        try:
            keep_documents(engine, reader, list(unique.values()), program, report)
        except PortalLoginRequired as exc:
            raise CampusLoginRequired("Die Anmeldung bei myCampus ist abgelaufen. Bitte erneut anmelden.") from exc
    log.info("myCampus-Import: %s Seiten, %s neue Einträge", report.pages, report.new_items)
    return report
