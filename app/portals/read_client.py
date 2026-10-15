# SPDX-License-Identifier: AGPL-3.0-or-later

"""Constrained, GET-only portal transport without session URLs in errors."""

import json
import re
from typing import Self
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup

from app.portals.session import PortalSession, valid_portal_url

MAX_HTML_BYTES = 2_000_000
MAX_FILE_BYTES = 60_000_000
MAX_REDIRECTS = 3
META_REFRESH = re.compile(r"^\s*\d+\s*;\s*url\s*=\s*['\"]?([^'\"]+)", re.IGNORECASE)


class PortalReadError(RuntimeError):
    """A read-only portal request failed without exposing its URL."""


class PortalLoginRequired(PortalReadError):
    """The captured browser session no longer permits a read."""


def _expand_bigpipe(soup: BeautifulSoup) -> None:
    """Read Drupal's streamed HTML fragments without executing JavaScript/AJAX."""
    for script in list(soup.select('script[type="application/vnd.drupal-ajax"]')):
        identity = script.get("data-big-pipe-replacement-for-placeholder-with-id")
        if not isinstance(identity, str):
            continue
        placeholder = soup.find(None, attrs={"data-big-pipe-placeholder-id": identity})
        if placeholder is None:
            continue
        try:
            commands = json.loads(script.get_text())
        except (ValueError, TypeError):
            continue
        if not isinstance(commands, list):
            continue
        for command in commands:
            if (not isinstance(command, dict) or command.get("command") != "insert"
                    or command.get("method") != "replaceWith"):
                continue
            fragment = command.get("data")
            if not isinstance(fragment, str) or len(fragment.encode()) > MAX_HTML_BYTES:
                continue
            replacement = BeautifulSoup(fragment, "html.parser")
            placeholder.replace_with(*list(replacement.contents))
            break


def _cookies(session: PortalSession, base_url: str) -> httpx.Cookies:
    host = urlsplit(base_url).hostname
    if host is None:
        raise PortalReadError("Portal-Konfiguration ist ungültig")
    jar = httpx.Cookies()
    for cookie in session.storage_state.get("cookies", []):
        if not isinstance(cookie, dict):
            continue
        domain = str(cookie.get("domain", "")).lstrip(".").lower()
        name, value = cookie.get("name"), cookie.get("value")
        path = cookie.get("path", "/")
        if (domain and (host == domain or host.endswith("." + domain))
                and isinstance(name, str) and isinstance(value, str)
                and isinstance(path, str) and path.startswith("/")):
            jar.set(name, value, domain=domain, path=path)
    return jar


class PortalReadClient:
    def __init__(self, base_url: str, session: PortalSession,
                 client: httpx.Client | None = None) -> None:
        if not valid_portal_url(session.entry_url, base_url):
            raise PortalReadError("Portal-Session passt nicht zur konfigurierten Adresse")
        self.base_url = base_url
        self.entry_url = session.entry_url
        self.client = client or httpx.Client(timeout=20, trust_env=False, follow_redirects=False,
                                              cookies=_cookies(session, base_url))
        self._owns_client = client is None
        if client is not None:
            self.client.cookies.update(_cookies(session, base_url))

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, _type, _value, _traceback) -> None:
        self.close()

    def get_file(self, target: str, max_bytes: int = MAX_FILE_BYTES) -> bytes:
        """Download a document with a plain GET; only from the portal host, never a login page."""
        address = urljoin(self.entry_url, target)
        for _ in range(MAX_REDIRECTS + 1):
            if not valid_portal_url(address, self.base_url):
                raise PortalReadError("Portal-Link verlässt die erlaubte Adresse")
            try:
                response = self.client.get(address, follow_redirects=False)
            except httpx.RequestError as exc:
                raise PortalReadError("Portal ist nicht erreichbar") from exc
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise PortalReadError("Portal-Weiterleitung ist unvollständig")
                destination = urljoin(address, location)
                if not valid_portal_url(destination, self.base_url):
                    raise PortalLoginRequired("Hochschul-Login erforderlich; Weiterleitung verlässt die erlaubte Adresse")
                address = destination
                continue
            if response.status_code in {401, 403}:
                raise PortalLoginRequired("Hochschul-Login erforderlich")
            if response.status_code != 200:
                raise PortalReadError("Portal-Abruf fehlgeschlagen")
            if "text/html" in response.headers.get("content-type", "").lower():
                raise PortalReadError("Portal lieferte keine Datei")
            if len(response.content) > max_bytes:
                raise PortalReadError("Datei ist zu groß")
            return response.content
        raise PortalReadError("Portal-Weiterleitungen sind nicht eindeutig")

    def get_html(self, target: str | None = None) -> str:
        return self.get_page(target)[0]

    def get_page(self, target: str | None = None) -> tuple[str, str]:
        """Return HTML and its final same-host URL for a matching proof capture."""
        address = self.entry_url if target is None else urljoin(self.entry_url, target)
        for _ in range(MAX_REDIRECTS + 1):
            if not valid_portal_url(address, self.base_url):
                raise PortalReadError("Portal-Link verlässt die erlaubte Adresse")
            try:
                response = self.client.get(address, follow_redirects=False)
            except httpx.RequestError as exc:
                raise PortalReadError("Portal ist nicht erreichbar") from exc
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise PortalReadError("Portal-Weiterleitung ist unvollständig")
                destination = urljoin(address, location)
                if not valid_portal_url(destination, self.base_url):
                    raise PortalLoginRequired("Hochschul-Login erforderlich; Weiterleitung verlässt die erlaubte Adresse")
                address = destination
                continue
            if response.status_code in {401, 403}:
                raise PortalLoginRequired("Hochschul-Login erforderlich")
            if response.status_code != 200:
                raise PortalReadError("Portal-Abruf fehlgeschlagen")
            if len(response.content) > MAX_HTML_BYTES:
                raise PortalReadError("Portal-Seite ist zu groß")
            if "text/html" not in response.headers.get("content-type", "").lower():
                raise PortalReadError("Portal lieferte keine HTML-Seite")
            soup = BeautifulSoup(response.text, "html.parser")
            _expand_bigpipe(soup)
            if soup.find("input", attrs={"type": re.compile("^password$", re.IGNORECASE)}):
                raise PortalLoginRequired("Hochschul-Login erforderlich")
            refresh = soup.find("meta", attrs={"http-equiv": re.compile("^refresh$", re.IGNORECASE)})
            match = META_REFRESH.match(str(refresh.get("content", ""))) if refresh else None
            # Ignore no-JavaScript fallback redirects in a readable portal page,
            # and long refresh timers that would otherwise loop immediately.
            if (match and refresh is not None and refresh.find_parent("noscript") is None
                    and int(str(refresh.get("content", "")).split(";", 1)[0].strip()) <= 5):
                destination = urljoin(address, match.group(1).strip())
                if not valid_portal_url(destination, self.base_url):
                    raise PortalLoginRequired("Hochschul-Login erforderlich")
                address = destination
                continue
            if not soup.get_text(" ", strip=True) and not soup.select("frame[src], iframe[src]"):
                raise PortalReadError("Portal lieferte keine lesbare Seite")
            return str(soup), address
        raise PortalReadError("Portal-Weiterleitungen sind nicht eindeutig")
