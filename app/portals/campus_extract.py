# SPDX-License-Identifier: AGPL-3.0-or-later

"""Recognise what a mycampus-style portal shows: events, news, documents and study programmes.

The portal marks its content up as cards (``article`` with a heading, a date, a short text and a
link). Nothing here depends on the real CSS class names; the meaning comes from the tags, the
headings above a card and the visible date and file labels.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import parse_qs, urldefrag, urljoin, urlsplit
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from bs4.element import Tag

MONTHS = {
    "januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7,
    "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12,
}
GERMAN_DATE = re.compile(
    r"(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})(?:\s*[-–]\s*(\d{1,2}):(\d{2})(?:\s*Uhr)?)?")
FILE_LABEL = re.compile(r"\b(PDF|DOCX?|XLSX?|PPTX?|ZIP)\s*\|\s*([\d.,]+)\s*(KB|MB|GB)\b", re.IGNORECASE)
FILE_EXTENSION = re.compile(r"\.(pdf|docx?|xlsx?|pptx?|zip)$", re.IGNORECASE)
HEADING = re.compile(r"^h[1-6]$")
PROGRAM = re.compile(r"^(Bachelor|Master|Diplom|Zertifikat)\b", re.IGNORECASE)
SESSION_ENTRIES = re.compile(r"abmeld|logout|log out|sign out|ausloggen|login|anmelden", re.IGNORECASE)
MAX_TEXT = 1500


@dataclass(frozen=True)
class CampusCard:
    kind: str  # event | news | document | page
    title: str
    url: str
    summary: str
    category: str
    published_at: datetime | None
    starts_at: datetime | None
    file_label: str | None
    key: str


@dataclass(frozen=True)
class ProgramLink:
    name: str
    url: str
    faculty: str
    degree: str


@dataclass(frozen=True)
class NavEntry:
    text: str
    url: str


def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_german_datetime(text: str, tz: ZoneInfo) -> datetime | None:
    """``29. September 2026 - 10:00 Uhr`` (local time) as an aware UTC moment."""
    match = GERMAN_DATE.search(text)
    if not match:
        return None
    month = MONTHS.get(match.group(2).casefold())
    if month is None:
        return None
    try:
        local = datetime(int(match.group(3)), month, int(match.group(1)),
                         int(match.group(4) or 0), int(match.group(5) or 0), tzinfo=tz)
    except ValueError:
        return None
    return local.astimezone(UTC)


def section_kind(heading: str) -> str | None:
    text = heading.casefold()
    if re.search(r"veranstaltung|termin|event", text):
        return "event"
    if re.search(r"dokument|download|unterlagen", text):
        return "document"
    if re.search(r"news|aktuell|meldung|neuigkeit", text):
        return "news"
    return None


def _same_host(url: str, page_url: str) -> bool:
    target, base = urlsplit(url), urlsplit(page_url)
    return (target.scheme == "https" and target.hostname == base.hostname
            and target.hostname is not None and not target.username and not target.password)


def _absolute(href: str | None, page_url: str) -> str:
    if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
        return ""
    url = urldefrag(urljoin(page_url, href))[0]
    return url if _same_host(url, page_url) else ""


def _moment(element: Tag, tz: ZoneInfo) -> datetime | None:
    stamp = element.find("time")
    if stamp is None:
        return parse_german_datetime(_clean(element.get_text(" "))[:MAX_TEXT], tz)
    raw = stamp.get("datetime")
    if isinstance(raw, str):
        try:
            parsed = datetime.fromisoformat(raw)
            return (parsed if parsed.tzinfo else parsed.replace(tzinfo=tz)).astimezone(UTC)
        except ValueError:
            pass
    return parse_german_datetime(_clean(stamp.get_text(" ")), tz)


def _in_page_furniture(heading: Tag, article: Tag) -> bool:
    """Whether a heading belongs to a form or comment block rather than to the article itself."""
    for node in heading.parents:
        if node is article:
            return False
        classes = " ".join(node.get("class") or []) if isinstance(node, Tag) else ""
        if node.name == "form" or "comment" in classes:
            return True
    return False


def _title_heading(article: Tag) -> Tag | None:
    """The article's own title. Drupal detail pages put it outside the article, leaving
    only the comment form's heading ("Neuen Kommentar hinzufügen") inside."""
    return next((heading for heading in article.find_all(HEADING) if not _in_page_furniture(heading, article)), None)


def _section_headings(article: Tag) -> list[str]:
    """Headings above a card that are not the titles of other cards, nearest first."""
    return [_clean(heading.get_text(" ")) for heading in article.find_all_previous(HEADING)
            if heading.find_parent("article") is None]


def _summary(article: Tag, title: str) -> str:
    for block in article.find_all(["p", "div"]):
        if block.find(["p", "div", "article", "header", "h1", "h2", "h3", "h4", "h5", "h6"]):
            continue
        text = _clean(block.get_text(" "))
        if (len(text) >= 15 and text != title and not FILE_LABEL.fullmatch(text)
                and not GERMAN_DATE.fullmatch(text) and text.casefold() != "mehr"):
            return text[:MAX_TEXT]
    return ""


def _key(kind: str, url: str, title: str, moment: datetime | None) -> str:
    basis = urlsplit(url).path if url else f"{title}|{moment.isoformat() if moment else ''}"
    return hashlib.sha256(f"{kind}\0{basis}".encode()).hexdigest()[:32]


def extract_cards(html: str, page_url: str, tz: ZoneInfo) -> list[CampusCard]:
    soup = BeautifulSoup(html, "html.parser")
    root = soup.find("main") or soup.body or soup
    cards: list[CampusCard] = []
    seen: set[str] = set()
    for article in root.find_all("article"):
        # A full Drupal degree page wraps several news/document cards in one
        # outer article. It is a page, not an additional news or PDF card.
        if article.find("article") or article.select_one(".document-content"):
            continue
        heading = _title_heading(article)
        title = _clean(heading.get_text(" ")) if heading else ""
        if not title:
            continue
        text = _clean(article.get_text(" "))
        label = FILE_LABEL.search(text)
        download = next((anchor for anchor in article.find_all("a", href=True)
                         if anchor.has_attr("download") or FILE_EXTENSION.search(urlsplit(str(anchor["href"])).path)),
                        None)
        headings = _section_headings(article)
        section = next((kind for kind in map(section_kind, headings) if kind), None)
        kind = "document" if label or download else (section if section != "document" else "news") or "news"
        title_link = heading.find("a", href=True) if heading else None
        link = download or title_link
        url = _absolute(str(link["href"]), page_url) if link else ""
        if kind == "document" and not url:
            continue
        moment = _moment(article, tz)
        if kind == "document":
            category = next((name for name in headings if name and section_kind(name) != "document"), "")
        else:
            header = article.find("header")
            first_link = header.find("a") if header else None
            category = _clean(first_link.get_text(" ")) if first_link else ""
        key = _key(kind, url, title, moment)
        if key in seen:
            continue
        seen.add(key)
        cards.append(CampusCard(
            kind=kind, title=title, url=url, summary=_summary(article, title), category=category,
            published_at=None if kind == "event" else moment, starts_at=moment if kind == "event" else None,
            file_label=(f"{label.group(1).upper()} | {label.group(2)} {label.group(3).upper()}" if label else None),
            key=key))
    # Drupal document lists use linked fields instead of article elements.
    for content in root.select(".document-content"):
        anchor = content.find_parent("a", href=True)
        title_node = content.select_one(".title")
        title = _clean(title_node.get_text(" ")) if title_node else ""
        url = _absolute(str(anchor["href"]), page_url) if anchor else ""
        label = FILE_LABEL.search(_clean(content.get_text(" ")))
        if anchor is None or not title or not url or label is None:
            continue
        wrapper = anchor.find_parent(class_="field__item") or anchor
        moment = _moment(wrapper, tz)
        heading = content.find_previous(HEADING)
        category = _clean(heading.get_text(" ")) if heading else "Dokumente"
        description = content.select_one(".description")
        key = _key("document", url, title, moment)
        if key in seen:
            continue
        seen.add(key)
        cards.append(CampusCard(
            kind="document", title=title, url=url,
            summary=_clean(description.get_text(" "))[:MAX_TEXT] if description else "",
            category=category, published_at=moment, starts_at=None,
            file_label=f"{label.group(1).upper()} | {label.group(2)} {label.group(3).upper()}", key=key))
    return cards


def extract_program_page(html: str, page_url: str) -> CampusCard | None:
    """Keep the text and source of a selected degree page, even without cards or files."""
    soup = BeautifulSoup(html, "html.parser")
    root = soup.find("main")
    heading = root.find("h1") if root else None
    title = _clean(heading.get_text(" ")) if heading else ""
    if not title or root is None:
        return None
    for element in list(root.select('script, style, form, input, nav, header, footer')):
        element.decompose()
    summary = root.get_text('\n', strip=True)[:100_000]
    return CampusCard(kind="page", title=title, url=page_url, summary=summary,
                      category="Studiengang", published_at=None, starts_at=None,
                      file_label=None, key=_key("page", page_url, title, None))


def find_program_links(html: str, page_url: str) -> list[ProgramLink]:
    """Study programmes (``Bachelor …``, ``Master …``) with the faculty and degree they are listed under."""
    soup = BeautifulSoup(html, "html.parser")
    programs: list[ProgramLink] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        name = _clean(anchor.get_text(" "))
        url = _absolute(str(anchor["href"]), page_url)
        if not url or url in seen or not PROGRAM.match(name):
            continue
        faculty = degree = ""
        for heading in anchor.find_all_previous(HEADING):
            text = _clean(heading.get_text(" "))
            if not degree and heading.name == "h3":
                degree = text
            if heading.name == "h2":
                faculty = text
                break
        seen.add(url)
        programs.append(ProgramLink(name=name, url=url, faculty=faculty,
                                    degree=degree or name.split(" ", 1)[0]))
    return programs


def find_navigation(html: str, page_url: str) -> list[NavEntry]:
    """The main navigation entries of the portal (same host only, no sign-out entries)."""
    soup = BeautifulSoup(html, "html.parser")
    nav = (soup.find("nav", attrs={"aria-label": re.compile("haupt|main", re.IGNORECASE)})
           or soup.select_one("nav.menu--main") or soup.find("nav"))
    entries: list[NavEntry] = []
    seen: set[str] = set()
    for anchor in (nav.find_all("a", href=True) if nav else []):
        text = _clean(anchor.get_text(" "))
        url = _absolute(str(anchor["href"]), page_url)
        if url and text and url not in seen and not SESSION_ENTRIES.search(text) and len(text) <= 80:
            seen.add(url)
            entries.append(NavEntry(text=text, url=url))
    return entries


def find_pagination(html: str, page_url: str) -> list[str]:
    """Addresses of the further pages of a paged list (page 2 onwards), each once."""
    soup = BeautifulSoup(html, "html.parser")
    pagers = soup.select('.pager, .pagination, [class*="pager"], [class*="pagination"], '
                         '[aria-label*="seiten" i], [aria-label*="pagination" i]')
    pages: list[str] = []
    for anchor in (anchor for pager in pagers for anchor in pager.find_all("a", href=True)):
        url = _absolute(str(anchor["href"]), page_url)
        numbers = parse_qs(urlsplit(url).query).get("page", [])
        # Drupal uses one comma-separated index per independently paged list;
        # an empty component is its default page zero (for example ",1").
        index = numbers[0] if numbers else ""
        if (url and re.fullmatch(r"[0-9]*(?:,[0-9]*)*", index)
                and any(part and int(part) >= 1 for part in index.split(",")) and url not in pages):
            pages.append(url)
    return pages
