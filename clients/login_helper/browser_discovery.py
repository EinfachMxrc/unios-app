# SPDX-License-Identifier: AGPL-3.0-or-later

"""Open reviewed read pages in an authenticated browser."""

from __future__ import annotations

import re
from collections.abc import Callable
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup
from playwright.sync_api import BrowserContext, Page, Route
from playwright.sync_api import Error as PlaywrightError

from app.portals.session import PortalSession, valid_portal_url

NAV_FIELDS = {"FH", "Language", "Nav", "Portal", "Session", "User"}
NAV_TERMS = {"exams": "prüf", "enrollment": "studium"}
MYCAMPUS_TERMS = {
    "timetable": ("stundenplan", "timetable"),
    "events": ("veranstaltungen", "events"),
    "news": ("neuigkeiten", "news", "aktuelle meldungen"),
}
FORBIDDEN_NAV = ("anmeld", "abmeld", "save", "delete", "update", "bezahlen")
MAX_HTML_BYTES = 2_000_000


class MenuRequestGuard:
    """Permit one exact CGI menu submission after a safe link is selected."""

    def __init__(self, base_url: str) -> None:
        self.host = urlsplit(base_url).hostname
        self.menu_budget = 0
        self.allowed_menu_requests = 0
        self.blocked_write_requests = 0

    def route(self, route: Route) -> None:
        request = route.request
        method = request.method.upper()
        if method in {"GET", "HEAD"}:
            route.continue_()
            return
        target = urlsplit(request.url)
        fields = parse_qs(request.post_data or "", keep_blank_values=True)
        nav = fields.get("Nav", [""])[0]
        allowed = (
            self.menu_budget > 0
            and method == "POST"
            and target.hostname == self.host
            and target.path.endswith("/index.pl")
            and "application/x-www-form-urlencoded" in request.headers.get("content-type", "")
            and set(fields) == NAV_FIELDS
            and bool(re.fullmatch(r"[A-Za-z0-9_./-]{1,80}", nav))
            and not any(word in nav.casefold() for word in FORBIDDEN_NAV)
        )
        if allowed:
            self.menu_budget -= 1
            self.allowed_menu_requests += 1
            route.continue_()
        else:
            self.blocked_write_requests += 1
            route.abort()


class ReadOnlyRequestGuard:
    """Block every browser write while opening known mycampus read pages."""

    def __init__(self) -> None:
        self.blocked_requests = 0

    def route(self, route: Route) -> None:
        if route.request.method.upper() in {"GET", "HEAD"}:
            route.continue_()
        else:
            self.blocked_requests += 1
            route.abort()


def discover_mycampus_browser_pages(context: BrowserContext, page: Page,
                                    session: PortalSession, base_url: str,
                                    wait: Callable[[float], None] | None = None,
                                    ) -> list[tuple[str, str]]:
    """Open only uniquely named, same-host read sections after the user's login."""
    if session.portal != "mycampus":
        return []
    guard = ReadOnlyRequestGuard()
    context.route("**/*", guard.route)
    collected: list[tuple[str, str]] = []
    try:
        (wait or page.wait_for_timeout)(1_500)
        if valid_portal_url(page.url, base_url):
            html = page.content()
            if len(html.encode("utf-8")) <= MAX_HTML_BYTES:
                collected.append(("start", html))
        for index, (category, terms) in enumerate(MYCAMPUS_TERMS.items()):
            try:
                if index:
                    page.goto(session.entry_url, wait_until="domcontentloaded", timeout=20_000)
                    (wait or page.wait_for_timeout)(1_500)
                candidates = []
                for item in page.locator("a, button").all()[:200]:
                    if not item.is_visible():
                        continue
                    label = item.inner_text(timeout=1_000).casefold().strip()
                    if (any(term in label for term in terms)
                            and not any(word in label for word in FORBIDDEN_NAV)):
                        candidates.append(item)
                if len(candidates) != 1:
                    continue
                candidate = candidates[0]
                if candidate.evaluate("el => el.tagName.toLowerCase()") == "a":
                    href = candidate.get_attribute("href")
                    if not href or href.startswith(("javascript:", "mailto:", "tel:")):
                        continue
                candidate.click(timeout=5_000)
                (wait or page.wait_for_timeout)(800)
                target = context.pages[-1] if context.pages else page
                if not valid_portal_url(target.url, base_url):
                    continue
                html = target.content()
                if len(html.encode("utf-8")) > MAX_HTML_BYTES:
                    continue
                soup = BeautifulSoup(html, "html.parser")
                if (len(soup.get_text(" ", strip=True)) < 40
                        or soup.find("input", attrs={"type": "password"})):
                    continue
                collected.append((category, html))
            except PlaywrightError:
                continue
    finally:
        context.unroute("**/*", guard.route)
    return collected


def discover_primuss_browser_pages(context: BrowserContext, page: Page,
                                   session: PortalSession, base_url: str,
                                   wait: Callable[[float], None] | None = None,
                                   ) -> list[tuple[str, str]]:
    """Capture known menu pages; never click registration or mutation controls."""
    if session.portal != "primuss":
        return []
    guard = MenuRequestGuard(base_url)
    context.route("**/*", guard.route)
    collected: list[tuple[str, str]] = []
    try:
        for category, term in NAV_TERMS.items():
            try:
                page.goto(session.entry_url, wait_until="domcontentloaded", timeout=20_000)
                candidates = [anchor for anchor in page.locator("a").all()
                              if term in anchor.inner_text(timeout=1_000).casefold()
                              and not any(word in anchor.inner_text(timeout=1_000).casefold()
                                          for word in FORBIDDEN_NAV)]
                if len(candidates) != 1:
                    continue
                guard.menu_budget = 1
                candidates[0].click(timeout=5_000)
                (wait or page.wait_for_timeout)(500)
                if not valid_portal_url(page.url, base_url):
                    continue
                html = page.content()
                if len(html.encode("utf-8")) > MAX_HTML_BYTES:
                    continue
                soup = BeautifulSoup(html, "html.parser")
                if (len(soup.get_text(" ", strip=True)) < 40
                        or soup.find("input", attrs={"type": "password"})):
                    continue
                collected.append((category, html))
            except PlaywrightError:
                continue
            finally:
                guard.menu_budget = 0
    finally:
        context.unroute("**/*", guard.route)
    return collected
