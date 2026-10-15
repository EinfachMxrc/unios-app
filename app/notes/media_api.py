# SPDX-License-Identifier: AGPL-3.0-or-later

"""Authenticated, bounded media import and range-capable playback."""

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.notes.media_service import MAX_BYTES, NoteMediaStore
from app.security import is_dashboard_request


class NoteMediaView(BaseModel):
    src: str
    kind: str
    mime: str


def note_media_router(settings, coordinator):
    router = APIRouter(prefix="/api/note-assets", tags=["notes"])
    store = NoteMediaStore(settings.data_dir)

    @router.post("", response_model=NoteMediaView)
    def upload(file: UploadFile):
        coordinator.assert_writer()
        try:
            raw = file.file.read(MAX_BYTES + 1)
            return store.save(raw, coordinator.assert_writer)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        finally:
            file.file.close()

    @router.get("/{filename}")
    def read(filename: str, request: Request):
        if not is_dashboard_request(request):
            raise HTTPException(403, "Cross-site media access denied")
        try:
            path, mime = store.read(filename)
        except (ValueError, FileNotFoundError):
            raise HTTPException(404, "Medium nicht gefunden") from None
        return FileResponse(path, media_type=mime, headers={"Cache-Control": "private, max-age=86400",
                                                          "X-Content-Type-Options": "nosniff"})

    return router
