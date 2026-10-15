# SPDX-License-Identifier: AGPL-3.0-or-later

"""Find a small set of read-only portal pages after the user's own login."""

from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.portals.read_client import PortalReadClient, PortalReadError
from app.portals.session import valid_portal_url

LABELS = {
    "primuss": {
        "exams": ("prüfungen", "prüfungsübersicht", "prüfungsstatus", "exams"),
        "grades": ("noten", "leistungsübersicht", "grades"),
        "enrollment": ("rückmeldung", "semesterstatus"),
    },
    "mycampus": {
        "study_program": ("studiengang",),
        "timetable": ("stundenplan", "timetable"),
        "events": ("veranstaltung", "events"),
        "news": ("neuigkeiten", "news", "aktuelle meldungen"),
    },
}
WRITE_WORDS = ("abmelden", "jetzt anmelden", "speichern", "löschen", "bezahlen", "absenden")


def discover_pages(reader: PortalReadClient, portal: str) -> list[tuple[str, str]]:
    """Return entry and clearly named same-host GET pages; never expose their URLs."""
    if portal not in LABELS:
        raise ValueError("Unbekanntes Hochschulportal")
    entry, address = reader.get_page()
    pages = [("start", entry)]
    links: dict[str, set[str]] = {category: set() for category in LABELS[portal]}
    for anchor in BeautifulSoup(entry, "html.parser").find_all("a", href=True):
        label = anchor.get_text(" ", strip=True).casefold()
        href = anchor.get("href")
        if (not isinstance(href, str) or not label or any(word in label for word in WRITE_WORDS)):
            continue
        target = urljoin(address, href)
        if target == address or not valid_portal_url(target, reader.base_url):
            continue
        for category, terms in LABELS[portal].items():
            if any(term in label for term in terms):
                links[category].add(target)
    for category, targets in links.items():
        if len(targets) != 1:
            continue  # Ambiguous links need a reviewed portal profile.
        target = next(iter(targets))
        try:
            html, _ = reader.get_page(target)
        except PortalReadError:
            continue
        pages.append((category, html))
        if portal == "mycampus" and category == "study_program":
            follow = BeautifulSoup(html, "html.parser")
            timetable_links: set[str] = set()
            for anchor in follow.find_all("a", href=True):
                label = anchor.get_text(" ", strip=True).casefold()
                href = anchor.get("href")
                if (not isinstance(href, str) or not any(
                        term in label for term in LABELS["mycampus"]["timetable"])
                        or any(word in label for word in WRITE_WORDS)):
                    continue
                candidate = urljoin(target, href)
                if valid_portal_url(candidate, reader.base_url):
                    timetable_links.add(candidate)
            if len(timetable_links) == 1:
                try:
                    timetable_html, _ = reader.get_page(next(iter(timetable_links)))
                    pages.append(("timetable", timetable_html))
                except PortalReadError:
                    pass
    return pages
