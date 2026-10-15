# SPDX-License-Identifier: AGPL-3.0-or-later

"""Integrated study mode backed by Anki's collection and scheduler."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated
from uuid import uuid4

from anki.collection import CardId, Collection
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.anki.card_schema import is_manual_note_marker, plain_card_html
from app.anki.collection import (
    export_package,
    import_package,
    open_collection,
    study_mode,
    write_study_mode,
)
from app.anki.study_repository import card_data, due_ids
from app.anki.study_repository import collection_counts as _counts
from app.anki.study_repository import last_review_ms_batch as _last_review_ms_batch
from app.anki.study_schema import (
    ReviewInput,
    StudyDueResponse,
    StudyReviewResponse,
    StudyStatsResponse,
    StudyStatusResponse,
    StudyUndoInput,
    StudyUndoResponse,
)
from app.anki.study_service import IMAGE_SUFFIXES as _IMAGE_SUFFIXES
from app.anki.study_service import (
    StudyError,
    StudyService,
    StudyUndoUnavailableError,
    safe_html,
)
from app.anki.study_service import card_dict as _card
from app.anki.study_service import card_single as _card_single
from app.anki.transfer_service import TransferError, TransferService
from app.config import Settings
from app.db.models import AnkiCard
from app.host.lease import HostCoordinator, HostLeaseError
from app.host.snapshots import create_snapshot

__all__ = ["_card", "_card_single", "_due_ids", "_safe_html", "study_router"]

# Compatibility for existing sanitizer callers; presentation is shared once.
_safe_html = safe_html

# Existing collections/cards callers import this projection from study_api.
_due_ids = due_ids


class CardEdit(BaseModel):
    front: str = Field(min_length=1, max_length=4000)
    back: str = Field(min_length=1, max_length=8000)


def _require_integrated(settings: Settings) -> None:
    if study_mode(settings) != "integrated":
        raise HTTPException(409, "Integrierter Lernmodus ist nicht aktiviert")


def _package_dir(settings: Settings) -> Path:
    path = settings.data_dir / "anki" / "packages"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _save_upload(package: UploadFile, path: Path) -> None:
    if not package.filename or not package.filename.lower().endswith(".apkg"):
        raise HTTPException(422, "Bitte eine .apkg-Datei auswählen")
    size = 0
    with path.open("xb") as output:
        while block := await package.read(1024 * 1024):
            size += len(block)
            if size > 200 * 1024 * 1024:
                raise HTTPException(413, "Anki-Paket ist zu groß")
            output.write(block)


def study_router(settings: Settings, factory, coordinator: HostCoordinator,
                 service: StudyService, transfer_service: TransferService | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/anki/study")
    transfer = transfer_service or TransferService(settings, factory, coordinator)

    def bound_writer() -> Callable[[], None]:
        coordinator.assert_writer()
        lease = coordinator.current()
        assert lease is not None
        expected = lease.device_id, lease.generation, lease.acquired_at

        def check() -> None:
            try:
                coordinator.assert_writer()
                current = coordinator.current()
                if current is None or (current.device_id, current.generation, current.acquired_at) != expected:
                    raise HostLeaseError("Staffelstab wurde erneut übernommen")
            except HostLeaseError as exc:
                raise StudyError(409, "STALE_HOST: Schreibberechtigung dieser Lernaktion ist nicht mehr gültig") from exc
        return check

    @router.get("/status", response_model=StudyStatusResponse)
    def status():
        return service.status()

    @router.get("/due", response_model=StudyDueResponse, responses={404: {}, 409: {}})
    def due(deck: Annotated[str | None, Query(min_length=1, max_length=1024)] = None):
        try:
            return service.due(deck)
        except StudyError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    @router.get("/stats", response_model=StudyStatsResponse, responses={409: {}})
    def stats():
        try:
            return service.stats()
        except StudyError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    @router.get("/cards")
    def cards(q: str = ""):
        _require_integrated(settings)
        with open_collection(settings, preserve_study_undo=True) as col:
            try:
                ids = col.find_cards(q)[:200]
            except Exception as exc:
                raise HTTPException(422, "Ungültige Anki-Suche") from exc
            last_reviews = _last_review_ms_batch(col, ids)
            materialized = [card_data(col, card_id, last_reviews.get(card_id)) for card_id in ids]
        return {"cards": [card.model_dump() for card in service.present_cards(materialized)]}

    @router.get("/media/{filename}")
    def media(filename: str):
        _require_integrated(settings)
        if (Path(filename).name != filename or filename in {".", ".."}
                or filename.startswith(".") or ":" in filename
                or Path(filename).suffix.lower() not in _IMAGE_SUFFIXES):
            raise HTTPException(404, "Anki-Medium nicht gefunden")
        with open_collection(settings, preserve_study_undo=True) as col:
            folder = Path(col.media.dir()).resolve()
            path = folder / filename
            if path.resolve().parent != folder or not path.is_file():
                raise HTTPException(404, "Anki-Medium nicht gefunden")
        return FileResponse(path, headers={"Cache-Control": "private, max-age=86400",
                                           "X-Content-Type-Options": "nosniff"})

    @router.put("/cards/{card_id}")
    def edit_card(card_id: int, payload: CardEdit):
        coordinator.assert_writer()
        _require_integrated(settings)
        with open_collection(settings) as col:
            try:
                card = col.get_card(CardId(card_id))
                note = card.note()
            except Exception as exc:
                raise HTTPException(404, "Karte nicht gefunden") from exc
            model = note.note_type()
            manual = is_manual_note_marker(dict(note.items()).get("UniOSId"))
            front = plain_card_html(payload.front) if manual else payload.front
            back = plain_card_html(payload.back) if manual else payload.back
            if model is not None and model["type"] == 1:
                note["Text"] = front
                note["Back Extra"] = back
            else:
                note["Front"] = front
                note["Back"] = back
            col.update_note(note)
            last_reviews = _last_review_ms_batch(col, [card_id])
            materialized = card_data(col, card_id, last_reviews.get(card_id))
        return service.present_cards([materialized])[0].model_dump()

    @router.post("/reviews", response_model=StudyReviewResponse, responses={
        404: {}, 409: {}, 422: {"description": "Unprocessable Content"},
        503: {"description": "Anki-Bewertung bestätigt; identische Wiederholung gleicht den Lernverlauf ab."},
    })
    def review(payload: ReviewInput):
        write_guard = bound_writer()
        try:
            return service.review(payload, write_guard)
        except StudyError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    @router.post("/reviews/undo", response_model=StudyUndoResponse, responses={409: {}, 503: {}})
    def undo_review(payload: StudyUndoInput):
        write_guard = bound_writer()
        try:
            return service.undo(payload, write_guard)
        except StudyUndoUnavailableError as exc:
            return JSONResponse(status_code=409, content={"code": "UNDO_UNAVAILABLE", "detail": exc.detail})
        except StudyError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    @router.post("/approved")
    def transfer_approved():
        coordinator.assert_writer()
        _require_integrated(settings)
        try:
            return {"imported": transfer.transfer_approved()}
        except TransferError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    def _preview_import_sync(directory: Path, path: Path) -> dict:
        """Anki's package import is synchronous C/Rust work; run off the event loop."""
        col = Collection(str(directory / "preview.anki2"))
        try:
            import_package(col, path)
            return _counts(col)
        finally:
            col.close()

    @router.post("/preview")
    async def preview_package(package: Annotated[UploadFile, File()]):
        with TemporaryDirectory(prefix="unios-anki-preview-") as directory:
            path = Path(directory) / "package.apkg"
            await _save_upload(package, path)
            try:
                return await run_in_threadpool(_preview_import_sync, Path(directory), path)
            except Exception as exc:
                raise HTTPException(422, "Anki-Paket ist ungültig oder nicht lesbar") from exc

    def _switch_to_integrated_sync(staged_path: Path) -> dict:
        """Whole-file snapshot + Anki import/export: synchronous I/O, run off the event loop."""
        create_snapshot(coordinator)
        with open_collection(settings) as col:
            before = _counts(col)
            if before["cards"]:
                export_package(col, _package_dir(settings) / f"before-import-{uuid4().hex}.apkg")
            import_package(col, staged_path)
            after = _counts(col)
        write_study_mode(settings, "integrated")
        return {"mode": "integrated", "before": before, "after": after}

    @router.post("/switch/integrated")
    async def switch_to_integrated(package: Annotated[UploadFile, File()]):
        coordinator.assert_writer()
        if study_mode(settings) == "integrated":
            raise HTTPException(409, "Integrierter Lernmodus ist bereits aktiv")
        with TemporaryDirectory(prefix="unios-anki-import-") as directory:
            staged_path = Path(directory) / "package.apkg"
            await _save_upload(package, staged_path)
            try:
                return await run_in_threadpool(_switch_to_integrated_sync, staged_path)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(422, "Anki-Paket konnte nicht importiert werden") from exc

    @router.post("/switch/integrated-empty")
    def start_integrated_empty():
        coordinator.assert_writer()
        if study_mode(settings) == "integrated":
            raise HTTPException(409, "Integrierter Lernmodus ist bereits aktiv")
        with factory() as session:
            if session.scalar(select(AnkiCard.id).limit(1)) is not None:
                raise HTTPException(409, "Vorhandene Anki-Karten zuerst als .apkg importieren")
        create_snapshot(coordinator)
        with open_collection(settings) as col:
            if _counts(col)["cards"]:
                raise HTTPException(409, "Vorhandene Collection muss erst übernommen werden")
        write_study_mode(settings, "integrated")
        return {"mode": "integrated"}

    @router.post("/switch/external")
    def switch_to_external():
        coordinator.assert_writer()
        _require_integrated(settings)
        create_snapshot(coordinator)
        package_name = f"transfer-{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{uuid4().hex[:8]}.apkg"
        with open_collection(settings) as col:
            counts = _counts(col)
            export_package(col, _package_dir(settings) / package_name)
        write_study_mode(settings, "external")
        return {"mode": "external", "package": package_name, "counts": counts}

    @router.post("/export")
    def create_export():
        coordinator.assert_writer()
        _require_integrated(settings)
        name = f"export-{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{uuid4().hex[:8]}.apkg"
        with open_collection(settings) as col:
            export_package(col, _package_dir(settings) / name)
        return {"package": name}

    @router.get("/packages/{name}")
    def download_package(name: str):
        if not name.endswith(".apkg") or Path(name).name != name:
            raise HTTPException(404, "Anki-Paket nicht gefunden")
        path = _package_dir(settings) / name
        if not path.is_file():
            raise HTTPException(404, "Anki-Paket nicht gefunden")
        return FileResponse(path, media_type="application/octet-stream", filename=name,
                            headers={"Cache-Control": "private, no-store"})

    return router
