# SPDX-License-Identifier: AGPL-3.0-or-later

"""Visible, user-controlled portal login; no credentials enter the command line."""

import argparse
from collections.abc import Callable
from pathlib import Path
from queue import Empty, SimpleQueue
from threading import Thread

from app.config import get_settings
from app.institutions import load_institution
from app.portals.discovery import discover_pages
from app.portals.read_client import (
    PortalLoginRequired,
    PortalReadClient,
    PortalReadError,
)
from app.portals.sample import PortalSampleError
from app.portals.session import (
    PortalSession,
    PortalSessionError,
    clear_session,
    keyring_available,
    load_session,
    save_session,
    valid_portal_url,
    validate_session,
)
from clients.portal_sample.__main__ import write_sample


def _prefer_browser_pages(pages: list[tuple[str, str]],
                          browser_pages: list[tuple[str, str]]) -> list[tuple[str, str]]:
    browser_kinds = {kind for kind, _ in browser_pages}
    starts = [item for item in browser_pages if item[0] == "start"]
    remainder = [item for item in pages if item[0] not in browser_kinds]
    if not starts:
        starts = [item for item in remainder if item[0] == "start"]
        remainder = [item for item in remainder if item[0] != "start"]
    return starts + remainder + [item for item in browser_pages if item[0] != "start"]


def _wait_for_user(wait: Callable[[float], None]) -> None:
    """Keep Playwright's event loop active while the user navigates the browser."""
    finished: SimpleQueue[bool] = SimpleQueue()

    def read_enter() -> None:
        try:
            input("Nach dem eigenen Login Enter drücken: ")
            finished.put(True)
        except EOFError:
            finished.put(False)

    Thread(target=read_enter, daemon=True).start()
    while True:
        try:
            if finished.get_nowait():
                return
            raise EOFError
        except Empty:
            wait(250)


def _capture_saved_sample(portal: str, base_url: str, session: PortalSession,
                          output: Path, max_pages: int, browser_channel: str) -> int:
    """Use a still valid saved session before asking for another SSO login."""
    from playwright.sync_api import sync_playwright

    from clients.login_helper.browser_discovery import (
        ReadOnlyRequestGuard,
        discover_mycampus_browser_pages,
        discover_primuss_browser_pages,
    )

    try:
        with PortalReadClient(base_url, session) as reader:
            pages = discover_pages(reader, portal)
    except PortalReadError:
        if portal != "mycampus":
            raise
        pages = []  # A browser session can work when the SPA's HTTP entry does not.
    if portal in {"primuss", "mycampus"}:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True, channel=None if browser_channel == "chromium" else browser_channel,
            )
            try:
                context = browser.new_context(storage_state=session.storage_state)  # type: ignore[arg-type]
                context.route("**/*", ReadOnlyRequestGuard().route)
                page = context.new_page()
                page.goto(session.entry_url, wait_until="domcontentloaded", timeout=20_000)
                if portal == "mycampus":
                    page.wait_for_timeout(1_500)
                    if page.get_by_text("Meine Dienste").count() == 0:
                        raise PortalLoginRequired("mycampus-Login erneut erforderlich")
                if portal == "primuss":
                    pages.extend(discover_primuss_browser_pages(context, page, session, base_url))
                else:
                    browser_pages = discover_mycampus_browser_pages(context, page, session, base_url)
                    pages = _prefer_browser_pages(pages, browser_pages)
            finally:
                browser.close()
    selected = pages[:max_pages]
    identifier = write_sample(portal, [html for _, html in selected], output,
                              page_types=[kind for kind, _ in selected])
    print(f"{len(selected)} Seiten automatisch gelesen und anonymisiert. Alias-ID: {identifier}")
    print("ZIP vor dem Teilen selbst prüfen; CSS-Zuordnung bleibt im System-Schlüsselbund.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Hochschul-Login im sichtbaren Browser")
    parser.add_argument("portal", choices=("primuss", "mycampus"))
    parser.add_argument("--browser", choices=("chromium", "chrome", "msedge"),
                        default="chromium",
                        help="Browser für den sichtbaren Login (Standard: Chromium)")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--status", action="store_true", help="Nur anzeigen, ob eine Session vorhanden ist")
    action.add_argument("--clear", action="store_true", help="Gespeicherte Session entfernen")
    action.add_argument("--check", action="store_true", help="Genau eine lesende Portal-Abfrage prüfen")
    action.add_argument("--sample-output", type=Path,
                        help="Nach eigenem Login lesende Unterseiten automatisch als anonymisiertes ZIP erfassen")
    action.add_argument("--sample-from-session", type=Path,
                        help="Mit gespeicherter Sitzung bekannte Portalseiten anonymisiert erfassen")
    parser.add_argument("--sample-pages", type=int, default=4,
                        help="Höchstzahl automatisch erfasster Seiten im ZIP (1 bis 5)")
    args = parser.parse_args()
    output = args.sample_output or args.sample_from_session
    if not 1 <= args.sample_pages <= 5 or (args.sample_pages != 4 and output is None):
        parser.error("--sample-pages erfordert eine ZIP-Ausgabe und einen Wert von 1 bis 5")
    profile = load_institution(get_settings().institution_slug)
    portal = getattr(profile, args.portal)
    if portal.base_url is None:
        print("Für dieses Portal fehlt die Adresse im Hochschulprofil.")
        return 1
    base_url = str(portal.base_url)
    if not keyring_available():
        print("Sicherer System-Schlüsselbund ist nicht verfügbar. Keine Session erfasst.")
        return 1
    try:
        if args.status:
            saved = load_session(args.portal, base_url)
            print("Portal-Session vorhanden; Gültigkeit erst beim Leseabruf prüfbar." if saved else
                  "Keine Portal-Session vorhanden.")
            return 0
        if args.clear:
            clear_session(args.portal, base_url)
            print("Portal-Session entfernt.")
            return 0
        if args.check:
            saved = load_session(args.portal, base_url)
            if saved is None:
                print("Hochschul-Login erforderlich.")
                return 1
            try:
                with PortalReadClient(base_url, saved) as reader:
                    reader.get_html()
            except PortalLoginRequired:
                print("Hochschul-Login erforderlich. Session erneuern.")
                return 1
            except PortalReadError:
                print("Portal-Abruf unklar. Bitte direkt im Browser prüfen.")
                return 1
            print("Portal hat eine HTML-Seite geliefert; Anmeldestatus und Inhalte sind noch nicht eindeutig geprüft.")
            return 0
        try:
            from playwright.sync_api import Error as PlaywrightError
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("Browser-Helfer fehlt. Zuerst `uv sync --locked --extra portals` ausführen.")
            return 1
        if args.sample_from_session is not None:
            saved = load_session(args.portal, base_url)
            if saved is None:
                print("Hochschul-Login erforderlich.")
                return 1
            try:
                return _capture_saved_sample(args.portal, base_url, saved,
                                             args.sample_from_session, args.sample_pages, args.browser)
            except PlaywrightError:
                print("Browser-Abruf fehlgeschlagen. Gespeicherte Sitzung prüfen.")
                return 1
        saved = load_session(args.portal, base_url)
        if saved is not None:
            try:
                if args.sample_output is not None:
                    return _capture_saved_sample(args.portal, base_url, saved,
                                                 args.sample_output, args.sample_pages, args.browser)
                with PortalReadClient(base_url, saved) as reader:
                    reader.get_html()
                print("Gespeicherte Portal-Session wird wiederverwendet.")
                return 0
            except (PortalLoginRequired, PortalReadError, PlaywrightError):
                print("Gespeicherte Sitzung ist nicht mehr nutzbar; erneuter Login nötig.")
        print("Ein sichtbarer Browser öffnet das Portal. Melde dich dort selbst an und bestätige MFA.")
        if args.portal == "primuss" and portal.login_start_url is not None:
            print("Öffne nach dem Login in mycampus einmal ‚Meine Dienste → PRIMUSS‘.")
        print("Warte auf die Portalseite, bevor du hier Enter drückst. Die Adresse wird nicht ausgegeben.")
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    headless=False,
                    channel=None if args.browser == "chromium" else args.browser,
                )
                try:
                    context = browser.new_context(
                        storage_state=saved.storage_state if saved is not None else None,  # type: ignore[arg-type]
                    )
                    page = context.new_page()
                    page.goto(str(portal.login_start_url or base_url),
                              wait_until="domcontentloaded", timeout=30_000)
                    _wait_for_user(page.wait_for_timeout)
                    page = context.pages[-1] if context.pages else page
                    if not valid_portal_url(page.url, base_url):
                        print(f"{args.portal.upper()} wurde im Browser noch nicht erreicht.")
                        return 1
                    session = validate_session(args.portal, base_url, page.url,
                                               dict(context.storage_state(indexed_db=False)),
                                               tuple(portal.auth_cookie_hosts))
                    try:
                        with PortalReadClient(base_url, session) as reader:
                            pages = discover_pages(reader, args.portal) if args.sample_output is not None else []
                            if args.sample_output is None:
                                reader.get_html()
                    except PortalReadError:
                        if args.portal != "mycampus" or args.sample_output is None:
                            raise
                        pages = []
                    if args.sample_output is not None:
                        from clients.login_helper.browser_discovery import (
                            discover_mycampus_browser_pages,
                            discover_primuss_browser_pages,
                        )

                        if args.portal == "primuss":
                            pages.extend(discover_primuss_browser_pages(context, page, session, base_url))
                        else:
                            browser_pages = discover_mycampus_browser_pages(context, page, session, base_url)
                            pages = _prefer_browser_pages(pages, browser_pages)
                        if not pages:
                            pages = [("start", page.content())]
                        selected = pages[:args.sample_pages]
                        identifier = write_sample(args.portal, [html for _, html in selected],
                                                  args.sample_output,
                                                  page_types=[kind for kind, _ in selected])
                        print(f"{len(selected)} Seiten automatisch gelesen und anonymisiert. Alias-ID: {identifier}")
                        print("ZIP vor dem Teilen selbst prüfen; CSS-Zuordnung bleibt im System-Schlüsselbund.")
                    save_session(base_url, session)
                    if args.portal == "primuss" and profile.mycampus.base_url is not None:
                        campus_url = str(profile.mycampus.base_url)
                        try:
                            campus_session = validate_session(
                                "mycampus", campus_url, campus_url + "/",
                                dict(context.storage_state(indexed_db=False)),
                                tuple(profile.mycampus.auth_cookie_hosts),
                            )
                            save_session(campus_url, campus_session)
                        except PortalSessionError:
                            pass  # PRIMUSS login may not have a reusable mycampus cookie.
                finally:
                    browser.close()
        except (PlaywrightError, EOFError, KeyboardInterrupt):
            print("Login nicht übernommen. Browser und Schlüsselbund prüfen.")
            return 1
        print("Portal-Session im System-Schlüsselbund gespeichert. Gültigkeit erst beim Leseabruf prüfbar.")
        return 0
    except OSError:
        print("Portal-Beispiel konnte nicht als ZIP geschrieben werden.")
        return 1
    except (PortalSessionError, PortalSampleError, PortalReadError) as exc:
        print(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
