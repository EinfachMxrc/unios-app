# SPDX-License-Identifier: AGPL-3.0-or-later
"""Import read-only pages/documents without interpreting unverified examination tables."""
import hashlib
import re
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urldefrag, urljoin, urlsplit

from bs4 import BeautifulSoup

from app.connectors.base import (
    ConnectorAuth,
    ConnectorStatus,
    RemoteResource,
    Snapshot,
)
from app.files.sidecars import safe_external_url
from app.portals.read_client import (
    PortalLoginRequired,
    PortalReadClient,
    PortalReadError,
)
from app.portals.session import valid_portal_url

READ_LABEL = re.compile(r"prüfungs?(?:ergebnis|leistung|termin|übersicht)|prüfungen|noten|leistung|bescheinigung|"
                        r"dokument|download|studien(?:verlauf|daten|status)|immatrikulationsbescheinigung|rückmeldestatus|"
                        r"nachricht|mitteilung|bekanntmachung|übersicht|anzeigen|mein studium|bescheid", re.IGNORECASE)
WRITE_LABEL = re.compile(r"(?:ab|an)meld|registrier|beantrag|ändern|bearbeit|speichern|löschen|logout|"
                         r"passwort|password|zahlung|bezahl|absend|submit|confirm|delete|cancel|enroll|register", re.IGNORECASE)
DOCUMENT = re.compile(r"\.(?:pdf|docx?|xlsx?|odt|csv|txt)(?:$|\?)", re.IGNORECASE)
MAX_PAGES = 60
MAX_FILES = 60


def read_link(label: str, url: str, base_url: str) -> bool:
    if not valid_portal_url(url, base_url) or WRITE_LABEL.search(label + " " + url):
        return False
    for key, value in parse_qsl(urlsplit(url).query):
        if key.lower() in {"action", "mode", "operation", "cmd"} and not re.fullmatch(
                r"view|read|show|list|download|display|overview", value, re.IGNORECASE):
            return False
    return bool(READ_LABEL.search(label) or DOCUMENT.search(url))


@dataclass
class PortalImportReport:
    pages: int = 0
    documents: int = 0
    files_stored: int = 0
    skipped: int = 0
    partial: bool = False
    warnings: list[str] = field(default_factory=list)


@dataclass
class RenderedPage:
    url: str
    html: str
    label: str


class PortalFiles:
    name = "primuss_portal"

    def __init__(self, payloads: dict[str, bytes]):
        self.payloads = payloads

    def check_auth(self):
        return ConnectorAuth("local", frozenset({"materials.read"}))

    def health(self):
        return ConnectorStatus("ok")

    def list_courses(self):
        return []

    def fetch_changes(self, since: int | None = None):
        return Snapshot([])

    def download(self, resource: RemoteResource) -> bytes:
        return self.payloads[resource.key]


def collect_primuss(reader: PortalReadClient, base_url: str,
                    sleep: Callable[[float], None] = time.sleep,
                    rendered: list[RenderedPage] | None = None, partial: bool = False):
    report = PortalImportReport()
    resources: list[RemoteResource] = []
    payloads: dict[str, bytes] = {}
    report.partial = partial
    pending: deque[tuple[str, RenderedPage | None]] = (
        deque((page.url, page) for page in rendered) if rendered else deque([(reader.entry_url, None)]))
    visited: set[str] = set()
    files: set[str] = set()
    total_bytes = 0
    while pending and report.pages < MAX_PAGES:
        address, captured = pending.popleft()
        identity = safe_external_url(address)
        traversal_key = address + ("\n" + captured.label if captured else "")
        if not identity or traversal_key in visited or not valid_portal_url(address, base_url):
            continue
        visited.add(traversal_key)
        try:
            if captured:
                html, final_url = captured.html, address
            else:
                sleep(0.4)
                html, final_url = reader.get_page(address)
        except PortalLoginRequired:
            raise
        except PortalReadError:
            if report.pages == 0:
                raise
            report.skipped += 1
            continue
        report.pages += 1
        soup = BeautifulSoup(html, "html.parser")
        title = soup.find("h1") or soup.find("title")
        title_text = captured.label if captured else (title.get_text(" ", strip=True)[:200] if title else "PRIMUSS")
        # Forms and navigation are neither submitted nor archived as personal records.
        main = soup.find("main") or soup.find(id="content") or soup.body or soup
        for form in list(main.find_all('form')):
            form.unwrap()
        for element in list(main.select("script, style, input, select, textarea, button, nav, header, footer")):
            element.decompose()
        body = main.get_text("\n", strip=True)[:100_000]
        key = hashlib.sha256((identity + ("\n" + captured.label if captured else "")).encode()).hexdigest()
        if body:
            payloads[key] = f"# {title_text}\n\n{body}\n".encode()
            resources.append(RemoteResource(key, f"{title_text.replace('/', '-')}.md", identity, "file", force_check=True))
        # Discovery uses the original page because read links may be inside navigation.
        for anchor in BeautifulSoup(html, "html.parser").select("a[href], iframe[src], frame[src]"):
            embedded = anchor.name in {"iframe", "frame"}
            label = anchor.get_text(" ", strip=True) or str(anchor.get("title", ""))
            raw = str(anchor.get("src" if embedded else "href", ""))
            if raw.startswith(("javascript:", "#")):
                if READ_LABEL.search(label) and not WRITE_LABEL.search(label) and not rendered:
                    report.partial = True
                continue
            target = urldefrag(urljoin(final_url, raw))[0]
            if embedded:
                label = "Übersicht " + label
            if not read_link(label, target, base_url):
                continue
            safe = safe_external_url(target)
            if not safe:
                continue
            if DOCUMENT.search(target) or re.search(r"\bdownload\b", label, re.IGNORECASE):
                if safe in files or len(files) >= MAX_FILES:
                    continue
                files.add(safe)
                sleep(0.4)
                try:
                    data = reader.get_file(target, max_bytes=25_000_000)
                except PortalLoginRequired:
                    raise
                except PortalReadError:
                    report.skipped += 1
                    continue
                file_key = hashlib.sha256(safe.encode()).hexdigest()
                total_bytes += len(data)
                if total_bytes > 100_000_000:
                    report.warnings.append("Der Dokumentenabruf hat das Größenlimit erreicht; weitere Dateien wurden ausgelassen.")
                    pending.clear()
                    break
                suffix = ".pdf" if data.startswith(b"%PDF-") else (urlsplit(target).path.rsplit("/", 1)[-1])
                if not suffix.startswith("."):
                    match = re.search(r"\.[a-zA-Z0-9]{2,5}$", suffix)
                    suffix = match[0] if match else ".bin"
                name = f"{(label or 'Dokument').replace('/', '-')[:160]}{suffix}"
                payloads[file_key] = data
                resources.append(RemoteResource(file_key, name, safe, "file", force_check=True))
                report.documents += 1
            elif target not in visited and len(pending) < MAX_PAGES * 2:
                pending.append((target, None))
    if pending or len(files) >= MAX_FILES:
        report.partial = True
        report.warnings.append("Der PRIMUSS-Abruf wurde begrenzt; weitere Inhalte können fehlen.")
    if report.pages <= 1:
        report.partial = True
        report.warnings.append("Keine weiteren lesbaren Bereiche erkannt. Prüfungsanmeldungen und Formulare werden ausgelassen.")
    if report.skipped:
        report.partial = True
        report.warnings.append(f"{report.skipped} Inhalte konnten nicht gelesen werden.")
    report.warnings.append("Seiten und Dokumente wurden archiviert. Strukturierte Noten und Prüfungsstatus benötigen weiterhin geprüfte Feldzuordnungen.")
    return report, resources, payloads
