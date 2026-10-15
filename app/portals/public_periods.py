# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read date-only semester periods from configured official public pages."""

from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from threading import Lock
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.config import Settings
from app.db.models import ConnectorHealth, PublicSemesterPeriod, utc_now
from app.host.lease import HostCoordinator
from app.institutions import load_institution

MAX_HTML_BYTES = 1_000_000
MAX_PAGES = 3
SYNC_LOCK = Lock()
SEMESTER = re.compile(r"(?:Sommersemester\s+(\d{4})|Wintersemester\s+(\d{4})/(\d{2,4}))", re.IGNORECASE)
RANGE = re.compile(
    r"(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)"
    r"\s*(\d{4})?\s*[–—-]\s*(\d{1,2})\.\s*"
    r"(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})",
    re.IGNORECASE,
)
MONTHS = {name.casefold(): index for index, name in enumerate(
    ("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"), start=1)}
LABELS = {"rückmeldezeitraum": "enrollment", "prüfungsanmeldung": "exam_registration"}


@dataclass(frozen=True)
class ParsedPeriod:
    semester: str
    kind: str
    starts_on: date
    ends_on: date


class PublicPeriodView(BaseModel):
    id: int
    semester: str
    kind: str
    starts_on: date
    ends_on: date
    source_url: str
    checked_at: datetime


class PublicPeriodsStatus(BaseModel):
    configured: bool
    state: str
    last_success_at: datetime | None
    periods: list[PublicPeriodView]


class PublicPeriodsReport(BaseModel):
    checked: int
    created: int
    updated: int


def configured_urls(settings: Settings) -> list[str]:
    if not settings.public_periods_enabled:
        return []
    try:
        urls = [str(url) for url in load_institution(settings.institution_slug).public_deadline_urls]
    except (OSError, ValueError):
        return []
    return urls[:MAX_PAGES]


def _is_public_address(raw: str) -> bool:
    try:
        address = ipaddress.ip_address(raw.split("%", 1)[0])  # drop an IPv6 zone id
    except ValueError:
        return False
    return not (address.is_private or address.is_loopback or address.is_link_local
                or address.is_reserved or address.is_multicast or address.is_unspecified)


def _resolves_to_public_address(hostname: str) -> bool:
    """Resolve ``hostname`` and reject it if any address is non-public.

    Mitigates DNS rebinding: a hostname that currently resolves to a public
    address could still change its record between checks, so callers should
    treat this as a best-effort pin, not a guarantee for the connection that
    follows. It is called anew right before every request in ``_fetch_html``.
    """
    try:
        infos = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addresses = {str(info[4][0]) for info in infos}
    return bool(addresses) and all(_is_public_address(address) for address in addresses)


def _safe_url(url: str) -> bool:
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.port not in {None, 443} or parsed.fragment or parsed.hostname == "localhost"):
        return False
    try:
        ipaddress.ip_address(parsed.hostname)
    except ValueError:
        if not ("." in parsed.hostname and not parsed.hostname.endswith((".local", ".internal"))):
            return False
        return _resolves_to_public_address(parsed.hostname)
    return False


def _parse_range(value: str, semester_years: set[int]) -> tuple[date, date] | None:
    match = RANGE.search(value)
    if match is None:
        return None
    start_year = int(match[3] or match[6])
    end_year = int(match[6])
    if start_year not in semester_years or end_year not in semester_years:
        return None
    try:
        start = date(start_year, MONTHS[match[2].casefold()], int(match[1]))
        end = date(end_year, MONTHS[match[5].casefold()], int(match[4]))
    except ValueError:
        return None
    return (start, end) if start <= end and end - start <= timedelta(days=62) else None


def parse_public_periods(html: str) -> list[ParsedPeriod]:
    soup = BeautifulSoup(html, "html.parser")
    root = soup.select_one("main") or soup.body
    if root is None:
        raise ValueError("Keine offizielle Semesterliste erkannt")
    lines = [" ".join(item.split()) for item in root.stripped_strings]
    headings: list[tuple[int, str, set[int]]] = []
    for index, line in enumerate(lines):
        match = SEMESTER.fullmatch(line)
        if match:
            first = int(match[1] or match[2])
            next_year = (int(match[3]) if match[3] and len(match[3]) == 4
                         else first + 1 if match[3] and int(match[3]) == (first + 1) % 100 else first)
            if next_year not in {first, first + 1}:
                continue
            headings.append((index, line, {first, next_year}))
    found: dict[tuple[str, str], ParsedPeriod] = {}
    for offset, (start_index, semester, years) in enumerate(headings):
        end_index = headings[offset + 1][0] if offset + 1 < len(headings) else len(lines)
        section = lines[start_index + 1:end_index]
        for index, line in enumerate(section):
            kind = LABELS.get(line.rstrip(":").casefold())
            if kind is None:
                continue
            period = _parse_range(" ".join(section[index + 1:index + 5]), years)
            if period is None:
                raise ValueError("Öffentlicher Semesterzeitraum ist unklar")
            row = ParsedPeriod(semester, kind, *period)
            key = semester, kind
            if key in found and found[key] != row:
                raise ValueError("Öffentliche Semesterzeiträume widersprechen sich")
            found[key] = row
    if not found:
        raise ValueError("Keine öffentlichen Rückmelde- oder Prüfungszeiträume erkannt")
    return list(found.values())


def _fetch_html(client: httpx.Client, url: str) -> str:
    if not _safe_url(url):
        raise ValueError("Öffentliche Fristenseite braucht eine geprüfte HTTPS-Adresse")
    with client.stream("GET", url, follow_redirects=False) as response:
        if response.status_code != 200 or "text/html" not in response.headers.get("content-type", "").lower():
            raise ValueError("Öffentliche Fristenseite ist nicht als HTML erreichbar")
        payload = bytearray()
        for chunk in response.iter_bytes():
            payload.extend(chunk)
            if len(payload) > MAX_HTML_BYTES:
                raise ValueError("Öffentliche Fristenseite ist zu groß")
        return payload.decode("utf-8", errors="replace")


def run_public_periods(settings: Settings, factory, coordinator: HostCoordinator,
                       client: httpx.Client | None = None) -> PublicPeriodsReport:
    urls = configured_urls(settings)
    if not urls:
        raise ValueError("Keine öffentliche Fristenseite im Hochschulprofil")
    if not SYNC_LOCK.acquire(blocking=False):
        raise RuntimeError("Öffentliche Fristenseiten werden bereits gelesen")
    try:
        coordinator.assert_writer()
        try:
            if client is None:
                with httpx.Client(timeout=10) as own_client:
                    pages = [(url, parse_public_periods(_fetch_html(own_client, url))) for url in urls]
            else:
                pages = [(url, parse_public_periods(_fetch_html(client, url))) for url in urls]
        except (httpx.HTTPError, ValueError, UnicodeError) as exc:
            with factory() as session:
                health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "public-semester"))
                if health is None:
                    health = ConnectorHealth(connector="public-semester", consecutive_failures=0)
                    session.add(health)
                health.status = "error"
                health.message = "Öffentliche Semesterzeiten prüfen"
                health.last_attempt_at = utc_now()
                health.consecutive_failures += 1
                session.commit()
            raise ValueError("Öffentliche Semesterzeiten konnten nicht sicher gelesen werden") from exc
        created = updated = 0
        with factory() as session:
            for url, periods in pages:
                for row in periods:
                    item = session.scalar(select(PublicSemesterPeriod).where(
                        PublicSemesterPeriod.source_url == url,
                        PublicSemesterPeriod.semester == row.semester,
                        PublicSemesterPeriod.kind == row.kind))
                    if item is None:
                        item = PublicSemesterPeriod(source_url=url, semester=row.semester, kind=row.kind)
                        session.add(item)
                        created += 1
                    elif (item.starts_on, item.ends_on) != (row.starts_on, row.ends_on):
                        updated += 1
                    item.starts_on, item.ends_on, item.checked_at = row.starts_on, row.ends_on, utc_now()
            health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "public-semester"))
            if health is None:
                health = ConnectorHealth(connector="public-semester")
                session.add(health)
            health.status = "ok"
            health.message = None
            health.consecutive_failures = 0
            health.last_attempt_at = health.last_success_at = utc_now()
            session.commit()
        return PublicPeriodsReport(checked=sum(len(periods) for _, periods in pages), created=created, updated=updated)
    finally:
        SYNC_LOCK.release()


def public_periods_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/public-periods", tags=["public-periods"])

    @router.get("", response_model=PublicPeriodsStatus)
    def status():
        with factory() as session:
            health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "public-semester"))
            periods = session.scalars(select(PublicSemesterPeriod)
                                      .where(PublicSemesterPeriod.ends_on >= datetime.now(settings.timezone).date() - timedelta(days=90))
                                      .order_by(PublicSemesterPeriod.starts_on).limit(30)).all()
            return PublicPeriodsStatus(configured=bool(configured_urls(settings)),
                                       state=health.status if health else "unknown",
                                       last_success_at=health.last_success_at if health else None,
                                       periods=[PublicPeriodView.model_validate(item, from_attributes=True) for item in periods])

    @router.post("/recheck", response_model=PublicPeriodsReport)
    def recheck():
        try:
            return run_public_periods(settings, factory, coordinator)
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(409 if isinstance(exc, RuntimeError) else 502, str(exc)) from exc

    return router
