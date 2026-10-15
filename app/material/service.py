# SPDX-License-Identifier: AGPL-3.0-or-later

"""PDF anchors and append-only annotation events, outside source documents."""

import json
import os
import re
from pathlib import Path
from uuid import uuid4

import pymupdf
from filelock import FileLock
from sqlalchemy import select

from app.db.models import MaterialAnnotation, Resource, ResourceVersion, utc_now
from app.files.atomic import ensure_directory
from app.material.errors import MaterialError
from app.material.preview import preview_pdf_path


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def _rects(rectangles, page) -> list[list[float]]:
    return [[round(rect.x0 / page.rect.width, 5), round(rect.y0 / page.rect.height, 5),
             round(rect.x1 / page.rect.width, 5), round(rect.y1 / page.rect.height, 5)]
            for rect in rectangles]


def _context_score(page_text: str, pos: int, quote: str, before: str, after: str) -> int:
    left = page_text[max(0, pos - len(before)):pos]
    right = page_text[pos + len(quote):pos + len(quote) + len(after)]
    before_score = 0
    for actual, expected in zip(reversed(left), reversed(before), strict=False):
        if actual != expected:
            break
        before_score += 1
    after_score = 0
    for actual, expected in zip(right, after, strict=False):
        if actual != expected:
            break
        after_score += 1
    return before_score + after_score


def anchor(path: Path, quote: str, preferred_page: int | None = None,
           context_before: str = "", context_after: str = "") -> dict:
    with pymupdf.open(path) as pdf:
        if preferred_page is not None and not 1 <= preferred_page <= len(pdf):
            raise MaterialError("Seite nicht vorhanden")
        pages = [preferred_page - 1] if preferred_page is not None else range(len(pdf))
        candidates: list[tuple[int, list[list[float]], int]] = []
        unmapped = False
        normalized_quote = _normalized(quote)
        if not normalized_quote:
            return {"status": "unmatched", "page": None, "rects": []}
        for index in pages:
            page = pdf[index]
            page_text = _normalized(page.get_text())
            positions = [match.start() for match in re.finditer(re.escape(normalized_quote), page_text)]
            rectangles = page.search_for(quote)
            if not positions or not rectangles:
                continue
            rects = _rects(rectangles, page)
            if len(positions) == 1:
                groups = [rects]  # A line break can make one match span several rectangles.
            elif len(positions) == len(rects):
                groups = [[rect] for rect in rects]
            else:
                unmapped = True
                continue
            for pos, group in zip(positions, groups, strict=True):
                score = _context_score(page_text, pos, normalized_quote,
                                       context_before, context_after)
                candidates.append((index + 1, group, score))
        if unmapped:
            return {"status": "ambiguous", "page": None, "rects": []}
        if not candidates:
            return {"status": "unmatched", "page": None, "rects": []}
        if len(candidates) == 1:
            chosen = candidates[0]
        else:
            ranked = sorted(candidates, key=lambda candidate: candidate[2], reverse=True)
            if ranked[0][2] < 10 or ranked[0][2] == ranked[1][2]:
                return {"status": "ambiguous", "page": None, "rects": []}
            chosen = ranked[0]
        page_number, rects, _ = chosen
        return {"status": "matched", "page": page_number, "rects": rects}


def _append_event(session, data_dir: Path, item: MaterialAnnotation, action: str,
                  position: dict) -> None:
    folder = ensure_directory(data_dir / "annotations")
    journal_resource_id = position.get("resource_id", item.resource_id)
    path = folder / f"{journal_resource_id}.jsonl"
    resource = session.get(Resource, item.resource_id)
    version = session.get(ResourceVersion, item.source_version_id)
    if resource is None or version is None:
        raise MaterialError("Material nicht gefunden")
    content = {
        "action": action,
        "id": item.id, "resource_id": journal_resource_id, "source_version_id": item.source_version_id,
        "source": resource.source, "source_key": resource.source_key,
        "source_version": version.version,
        "kind": item.kind, "quote": item.quote, "comment": item.comment,
        "context_before": position["context_before"], "context_after": position["context_after"],
        "source_page": item.source_page, "source_rects": position["source_rects"],
        "resolved": item.resolved, "revision": item.revision,
        "created_at": item.created_at.isoformat(), "updated_at": item.updated_at.isoformat(),
    }
    line = (json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if path.is_symlink():
        raise MaterialError("Ungültiger Ablagepfad")
    flags = os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags, 0o600), "ab", buffering=0) as stream:
        stream.write(line)
        os.fsync(stream.fileno())


def current_event(session, data_dir: Path, item: MaterialAnnotation, *, locked: bool = False) -> dict:
    if not locked:
        # Journal append precedes the SQLite commit. Readers must wait for the
        # same per-resource writer lock and refresh a previously loaded row.
        # Otherwise a concurrent reopen can look like a corrupt index.
        lock_folder = data_dir / 'annotations' / 'locks'
        if lock_folder.is_dir():
            try:
                with FileLock(lock_folder / f'{item.resource_id}.lock', timeout=5):
                    session.refresh(item)
                    return current_event(session, data_dir, item, locked=True)
            except PermissionError:
                # A read-only standby cannot write an advisory lock; it has no
                # local annotation writer. Preserve the strict journal check.
                pass
        session.refresh(item)
        return current_event(session, data_dir, item, locked=True)
    folder = data_dir / "annotations"
    preferred = folder / f"{item.resource_id}.jsonl"
    if preferred.is_symlink():
        raise MaterialError("Ungültiger Ablagepfad")
    latest: dict | None = None
    paths = ([preferred] if preferred.is_file() else []) + [
        path for path in sorted(folder.glob("*.jsonl")) if path != preferred]
    for path in paths:
        if path.is_symlink():
            raise MaterialError("Ungültiger Ablagepfad")
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise MaterialError("Markierungsprotokoll beschädigt; Index prüfen") from exc
                if (not isinstance(event, dict) or not isinstance(event.get("revision"), int)
                        or not all(key in event for key in (
                            "id", "source", "source_key", "source_version", "quote", "comment",
                            "context_before", "context_after", "source_rects", "source_page"))
                        or not all(isinstance(event[key], str) for key in (
                            "quote", "comment", "context_before", "context_after"))
                        or not isinstance(event["source_rects"], list)
                        or not isinstance(event["source_page"], int)):
                    raise MaterialError("Markierungsprotokoll beschädigt; Index prüfen")
                if event.get("id") == item.id and (latest is None or
                        event.get("revision", 0) > latest.get("revision", 0)):
                    latest = event
        if latest is not None and latest.get("revision") == item.revision:
            break
    resource = session.get(Resource, item.resource_id)
    version = session.get(ResourceVersion, item.source_version_id)
    if (latest is None or latest.get("revision") != item.revision
            or latest.get("action") == "delete"
            or resource is None or version is None
            or latest.get("source") != resource.source
            or latest.get("source_key") != resource.source_key
            or latest.get("source_version") != version.version
            or latest.get("kind") != item.kind or latest.get("resolved") != item.resolved
            or latest.get("source_page") != item.source_page
            or latest.get("quote") != item.quote or latest.get("comment") != item.comment):
        raise MaterialError("Markierungsprotokoll und Index weichen ab; Index neu aufbauen")
    return latest


def _quote_context(path: Path, page: int, quote: str) -> tuple[str, str]:
    with pymupdf.open(path) as pdf:
        page_text = _normalized(pdf[page - 1].get_text())
    normalized_quote = _normalized(quote)
    pos = page_text.find(normalized_quote)
    before = page_text[max(0, pos - 80):pos] if pos >= 0 else ""
    after = page_text[pos + len(normalized_quote):pos + len(normalized_quote) + 80] if pos >= 0 else ""
    return before, after


def _validate_rects(rects: list[list[float]] | None) -> None:
    if rects is not None and (not rects or len(rects) > 30 or any(
        len(rect) != 4 or not all(0 <= value <= 1 for value in rect)
        or rect[0] >= rect[2] or rect[1] >= rect[3] for rect in rects
    )):
        raise MaterialError("Ungültige Textposition")


def create(session, data_dir: Path, version: ResourceVersion, kind: str, quote: str,
           page: int, comment: str, rects: list[list[float]] | None = None,
           annotation_id: str | None = None) -> MaterialAnnotation:
    if kind not in {"highlight", "question"}:
        raise MaterialError("Ungültige Markierungsart")
    quote = quote.strip()
    if not 2 <= len(quote) <= 1000 or len(comment) > 5000:
        raise MaterialError("Markierung oder Kommentar hat eine ungültige Länge")
    path = preview_pdf_path(data_dir, version, allow_convert=True)
    found = anchor(path, quote, page)
    if found["status"] == "unmatched":
        raise MaterialError("Markierter Text kommt auf dieser Seite nicht vor")
    _validate_rects(rects)
    if rects is None and found["status"] != "matched":
        raise MaterialError("Text kommt mehrfach vor; bitte direkt im PDF auswählen")
    before, after = _quote_context(path, page, quote)
    now = utc_now()
    item = MaterialAnnotation(id=annotation_id or str(uuid4()), resource_id=version.resource_id,
                              source_version_id=version.id, kind=kind, quote=quote,
                              comment=comment.strip(), source_page=page,
                              resolved=False, revision=1, created_at=now, updated_at=now)
    position = {"context_before": before, "context_after": after,
                "source_rects": rects or found["rects"]}
    lock_folder = ensure_directory(data_dir / "annotations" / "locks")
    with FileLock(lock_folder / f"{item.resource_id}.lock", timeout=5):
        if annotation_id is not None:
            existing = session.get(MaterialAnnotation, annotation_id)
            if existing is not None:
                if (existing.source_version_id != version.id or existing.kind != kind
                        or existing.quote != quote or existing.source_page != page
                        or existing.comment != comment.strip()):
                    raise MaterialError("Diese Markierung ist bereits anders gespeichert")
                current_event(session, data_dir, existing, locked=True)
                return existing
        session.add(item)
        _append_event(session, data_dir, item, "create", position)
        session.commit()
    return item


def update(session, data_dir: Path, item: MaterialAnnotation, *, comment: str,
           resolved: bool, expected_revision: int) -> MaterialAnnotation:
    lock_folder = ensure_directory(data_dir / "annotations" / "locks")
    with FileLock(lock_folder / f"{item.resource_id}.lock", timeout=5):
        session.refresh(item)
        if item.revision != expected_revision:
            raise MaterialError("Markierung wurde inzwischen geändert")
        previous = current_event(session, data_dir, item, locked=True)
        if len(comment) > 5000:
            raise MaterialError("Kommentar ist zu lang")
        item.comment = comment.strip()
        item.resolved = resolved
        item.revision += 1
        item.updated_at = utc_now()
        _append_event(session, data_dir, item, "update", previous)
        session.commit()
        return item


def delete_annotation(session, data_dir: Path, item: MaterialAnnotation, expected_revision: int) -> None:
    lock_folder = ensure_directory(data_dir / "annotations" / "locks")
    with FileLock(lock_folder / f"{item.resource_id}.lock", timeout=5):
        session.refresh(item)
        if item.revision != expected_revision:
            raise MaterialError("Markierung wurde inzwischen geändert")
        previous = current_event(session, data_dir, item, locked=True)
        item.revision += 1
        item.updated_at = utc_now()
        _append_event(session, data_dir, item, "delete", previous)
        session.delete(item)
        session.commit()


def reanchor(session, data_dir: Path, item: MaterialAnnotation, version: ResourceVersion, *,
             quote: str, page: int, rects: list[list[float]], expected_revision: int) -> MaterialAnnotation:
    if version.resource_id != item.resource_id:
        raise MaterialError("Markierung gehört zu einem anderen Dokument")
    quote = quote.strip()
    if not 2 <= len(quote) <= 1000:
        raise MaterialError("Markierter Text hat eine ungültige Länge")
    _validate_rects(rects)
    path = preview_pdf_path(data_dir, version, allow_convert=True)
    found = anchor(path, quote, page)
    if found["status"] == "unmatched":
        raise MaterialError("Markierter Text kommt auf dieser Seite nicht vor")
    before, after = _quote_context(path, page, quote)
    lock_folder = ensure_directory(data_dir / "annotations" / "locks")
    with FileLock(lock_folder / f"{item.resource_id}.lock", timeout=5):
        session.refresh(item)
        if item.revision != expected_revision:
            raise MaterialError("Markierung wurde inzwischen geändert")
        previous = current_event(session, data_dir, item, locked=True)
        item.source_version_id = version.id
        item.quote = quote
        item.source_page = page
        item.revision += 1
        item.updated_at = utc_now()
        _append_event(session, data_dir, item, "reanchor", {
            "resource_id": previous["resource_id"], "context_before": before,
            "context_after": after, "source_rects": rects})
        session.commit()
        return item


def _historic_position(data_dir: Path, item: MaterialAnnotation, version: ResourceVersion) -> dict | None:
    folder = data_dir / "annotations"
    preferred = folder / f"{item.resource_id}.jsonl"
    paths = ([preferred] if preferred.is_file() else []) + [
        path for path in sorted(folder.glob("*.jsonl")) if path != preferred]
    selected = None
    for path in paths:
        if path.is_symlink():
            raise MaterialError("Ungültiger Ablagepfad")
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise MaterialError("Markierungsprotokoll beschädigt; Index prüfen") from exc
                if not isinstance(event, dict):
                    raise MaterialError("Markierungsprotokoll beschädigt; Index prüfen")
                if (event.get("id") == item.id and event.get("source_version") == version.version
                        and event.get("action") != "delete"):
                    selected = event
        if selected:
            break
    return selected


def display(session, data_dir: Path, version: ResourceVersion, item: MaterialAnnotation,
            *, locked: bool = False) -> dict:
    current = current_event(session, data_dir, item, locked=locked)
    historic = None if item.source_version_id == version.id else _historic_position(data_dir, item, version)
    if item.source_version_id == version.id:
        found = {"status": "matched", "page": item.source_page,
                 "rects": current["source_rects"]}
    elif historic:
        found = {"status": "matched", "page": historic["source_page"],
                 "rects": historic["source_rects"]}
    else:
        found = anchor(preview_pdf_path(data_dir, version), current["quote"],
                       context_before=current["context_before"], context_after=current["context_after"])
    return {"id": item.id, "resource_id": item.resource_id, "source_version_id": item.source_version_id,
            "kind": item.kind, "quote": historic["quote"] if historic else current["quote"],
            "comment": current["comment"],
            "resolved": item.resolved, "revision": item.revision,
            "created_at": item.created_at, "updated_at": item.updated_at,
            "anchor": found}


def annotations_for(session, data_dir: Path, version: ResourceVersion) -> list[dict]:
    items = session.scalars(select(MaterialAnnotation).where(MaterialAnnotation.resource_id == version.resource_id)
                            .order_by(MaterialAnnotation.created_at.desc())).all()
    return [display(session, data_dir, version, item) for item in items]


def resource_for(session, version: ResourceVersion) -> Resource:
    resource = session.get(Resource, version.resource_id)
    if resource is None:
        raise MaterialError("Material nicht gefunden")
    return resource
