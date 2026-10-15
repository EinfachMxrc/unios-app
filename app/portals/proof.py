# SPDX-License-Identifier: AGPL-3.0-or-later

"""Capture a read-only proof of the exact portal page that was checked."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from app.files.atomic import ensure_directory, write_once
from app.portals.session import PortalSession, valid_portal_url

MAX_PROOF_BYTES = 20_000_000
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PROOF_ID = re.compile(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}")


class PortalProofError(RuntimeError):
    """A portal proof cannot be trusted or safely stored."""


def allow_portal_request(route, base_url: str) -> None:
    request = route.request
    if request.method != "GET" or not valid_portal_url(request.url, base_url):
        route.abort()
    else:
        route.continue_()


def capture_portal_proof(base_url: str, address: str,
                         session: PortalSession) -> tuple[bytes, str]:
    """Read one page with Playwright, denying all writes and foreign requests."""
    if session.portal != "primuss" or not valid_portal_url(session.entry_url, base_url) or not valid_portal_url(address, base_url):
        raise PortalProofError("Nachweisadresse verlässt das konfigurierte Portal")
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise PortalProofError("Browser für PRIMUSS-Nachweis fehlt") from exc
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                context = browser.new_context(storage_state=cast(Any, session.storage_state),
                                              java_script_enabled=False, service_workers="block")
                page = context.new_page()

                page.route("**/*", lambda route: allow_portal_request(route, base_url))
                response = page.goto(address, wait_until="domcontentloaded", timeout=20_000)
                if response is None or response.status != 200 or not valid_portal_url(page.url, base_url):
                    raise PortalProofError("Nachweisseite konnte nicht eindeutig gelesen werden")
                html = page.content()
                image = page.screenshot(full_page=True, animations="disabled")
                if not image.startswith(PNG_SIGNATURE) or len(image) > MAX_PROOF_BYTES:
                    raise PortalProofError("Nachweisbild ist ungültig oder zu groß")
                return image, html
            finally:
                browser.close()
    except PlaywrightError as exc:
        raise PortalProofError("Nachweisbild konnte nicht aufgenommen werden") from exc


def save_portal_proof(data_dir: Path, image: bytes,
                      captured_at: datetime | None = None) -> tuple[str, datetime]:
    if not image.startswith(PNG_SIGNATURE) or len(image) > MAX_PROOF_BYTES:
        raise PortalProofError("Nachweisbild ist ungültig oder zu groß")
    captured_at = captured_at or datetime.now(UTC)
    if captured_at.tzinfo is None:
        raise PortalProofError("Nachweiszeitpunkt braucht eine Zeitzone")
    proof_id = f"{captured_at.astimezone(UTC):%Y%m%dT%H%M%SZ}-{uuid4().hex}"
    try:
        directory = ensure_directory(data_dir, "portal-proofs", "primuss")
        write_once(directory / f"{proof_id}.png", image)
    except (OSError, ValueError) as exc:
        raise PortalProofError("Nachweisbild konnte nicht sicher gespeichert werden") from exc
    return proof_id, captured_at


def proof_path(data_dir: Path, proof_id: str) -> Path | None:
    if not PROOF_ID.fullmatch(proof_id):
        return None
    parent = data_dir / "portal-proofs"
    folder = parent / "primuss"
    target = folder / f"{proof_id}.png"
    if (data_dir.is_symlink() or parent.is_symlink() or folder.is_symlink()
            or target.is_symlink() or not target.is_file()
            or not target.resolve().is_relative_to(data_dir.resolve())):
        return None
    return target
