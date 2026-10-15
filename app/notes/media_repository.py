# SPDX-License-Identifier: AGPL-3.0-or-later

"""Immutable file access for private note attachments."""

from pathlib import Path
from uuid import uuid4

from app.files.atomic import ensure_directory, write_once
from app.files.localpath import resolve_local


class NoteMediaRepository:
    def __init__(self, data_dir: Path):
        self.root = data_dir / "note-media"

    def insert(self, raw: bytes, extension: str) -> str:
        filename = f"{uuid4()}.{extension}"
        folder = ensure_directory(self.root)
        write_once(folder / filename, raw)
        return filename

    def path(self, filename: str) -> Path:
        root = resolve_local(self.root)
        target = self.root / filename
        if target.is_symlink() or not resolve_local(target).is_relative_to(root) or not target.is_file():
            raise FileNotFoundError("Medium nicht gefunden")
        return target
