# SPDX-License-Identifier: AGPL-3.0-or-later

"""Private immutable note media, without executing or extracting uploaded files."""

import re
from pathlib import Path

import filetype

from app.notes.media_repository import NoteMediaRepository

MAX_BYTES = 25_000_000
FORMATS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
           "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg",
           "video/mp4": "mp4", "video/webm": "webm"}


class NoteMediaStore:
    def __init__(self, data_dir: Path):
        self.repository = NoteMediaRepository(data_dir)
        self.root = self.repository.root

    def save(self, raw: bytes, guard) -> dict:
        guessed = filetype.guess(raw)
        mime = guessed.mime if guessed else ""
        mime = {"audio/x-wav": "audio/wav", "application/ogg": "audio/ogg"}.get(mime, mime)
        if not raw or len(raw) > MAX_BYTES or mime not in FORMATS:
            raise ValueError("Bild, Audio oder Video bis 25 MB wählen (PNG, JPEG, WebP, MP3, WAV, OGG, MP4, WebM)")
        guard()
        filename = self.repository.insert(raw, FORMATS[mime])
        guard()
        return {"src": f"/api/note-assets/{filename}", "kind": mime.split("/")[0], "mime": mime}

    def read(self, filename: str) -> tuple[Path, str]:
        if not re.fullmatch(r"[0-9a-f-]{36}\.(?:png|jpg|webp|mp3|wav|ogg|mp4|webm)", filename):
            raise ValueError("Ungültiges Medium")
        target = self.repository.path(filename)
        mime = next(mime for mime, extension in FORMATS.items() if target.suffix == "." + extension)
        return target, mime
