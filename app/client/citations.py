# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read-only citation compatibility for servers without the new reader route."""

import asyncio
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.material.citations import CITATION_LIMIT, Citation, cited_pages
from app.web.schemas import MaterialCitationsView

MAX_NOTES = 200
PAGE_SIZE = 100
TIMEOUT_SECONDS = 12


async def _json(remote: httpx.AsyncClient, url: str, headers: dict[str, str],
                *, params=None, missing_ok=False):
    response = await remote.get(url, headers=headers, params=params)
    if missing_ok and response.status_code == 404:
        return None
    if response.is_redirect:
        raise HTTPException(502, "Server antwortet mit einer unerwarteten Weiterleitung")
    if response.status_code != 200:
        raise HTTPException(response.status_code, "Quellenverweise konnten nicht gelesen werden")
    try:
        value = response.json()
        if not isinstance(value, dict):
            raise TypeError
        return value
    except (TypeError, ValueError):
        raise HTTPException(502, "Server liefert unvollständige Quellenverweise") from None


async def _citations(remote: httpx.AsyncClient, url: str, headers: dict[str, str],
                     version_id: int) -> list[Citation]:
    material = await _json(remote, f"{url}/api/material/{version_id}", headers)
    try:
        versions = {item["id"] for item in material["versions"]}
        if version_id not in versions or any(type(item) is not int for item in versions):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise HTTPException(502, "Server liefert unvollständige Materialversionen") from None
    citations: list[Citation] = []
    seen: set[str] = set()
    offset = 0
    while offset < MAX_NOTES:
        # The old list searches titles only. Page through its metadata instead
        # of silently missing notes whose source links occur only in the body.
        listing = await _json(remote, f"{url}/api/notes", headers,
                              params={"offset": offset, "limit": PAGE_SIZE})
        notes = listing.get("notes")
        if not isinstance(notes, list) or len(notes) > PAGE_SIZE:
            raise HTTPException(502, "Server liefert unvollständige Notizdaten")
        for summary in notes:
            try:
                note_id = str(UUID(summary["id"]))
            except (KeyError, TypeError, ValueError, AttributeError):
                raise HTTPException(502, "Server liefert ungültige Notizverweise") from None
            if note_id in seen:
                continue
            seen.add(note_id)
            detail = await _json(remote, f"{url}/api/notes/{note_id}", headers, missing_ok=True)
            if detail is None:  # Deleted between the metadata and detail reads.
                continue
            try:
                body = detail["body"]
                note = detail["note"]
                if not isinstance(body, str) or len(body) > 100_000 or note["id"] != note_id:
                    raise ValueError
                pages = cited_pages(body, versions)
                if not pages:
                    continue
                citations.append({"note_id": note_id, "title": note["title"],
                                  "course_name": note["course_name"],
                                  "revision": detail["selected_revision"], "pages": pages,
                                  "current_version": bool(cited_pages(body, {version_id}))})
                if len(citations) == CITATION_LIMIT:
                    return citations
            except (KeyError, TypeError, ValueError):
                raise HTTPException(502, "Server liefert unvollständige Notizdaten") from None
        page = listing.get("page")
        more = page.get("has_more") if isinstance(page, dict) else len(notes) == PAGE_SIZE
        if type(more) is not bool or (more and not notes):
            raise HTTPException(502, "Server liefert unvollständige Notizseiten")
        if more is False:
            return citations
        offset += len(notes)
    # Never label a truncated scan as complete or claim there are no citations.
    raise HTTPException(503, "Für diesen Notizumfang benötigt der Server ein Update")


async def legacy_citations(remote: httpx.AsyncClient, url: str, headers: dict[str, str],
                           version_id: int) -> dict:
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            items = await _citations(remote, url, headers, version_id)
            return MaterialCitationsView.model_validate({"citations": items}).model_dump()
    except TimeoutError:
        raise HTTPException(503, "Quellenverweise dauern zu lange; bitte erneut versuchen") from None
    except ValidationError:
        raise HTTPException(502, "Server liefert unvollständige Quellenverweise") from None
