# SPDX-License-Identifier: AGPL-3.0-or-later

import hashlib
import mimetypes
import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path

import filetype

from app.files.atomic import ensure_directory, write_once
from app.files.localpath import native_path

WINDOWS_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
INVALID = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_name(name: str, max_length: int = 100) -> str:
    value = unicodedata.normalize("NFC", name)
    value = INVALID.sub("_", value).strip().rstrip(". ")
    value = re.sub(r"\s+", "_", value)
    if not value or value in {".", ".."}:
        value = "Unbenannt"
    stem, dot, suffix = value.rpartition(".")
    if dot and suffix and len(suffix) <= 12:
        stem = stem[: max_length - len(suffix) - 1].rstrip(". ")
        value = stem + "." + suffix
    else:
        value = value[:max_length].rstrip(". ")
    if value.split(".")[0].upper() in WINDOWS_RESERVED:
        value = "_" + value
    return value


def content_type(data: bytes, filename: str) -> str:
    detected = filetype.guess(data)
    if detected:
        return detected.mime
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


# Windows cannot open paths of 260 characters or more unless long paths are switched on.
MAX_PATH_CHARS = 240
TEMPORARY_FILE_CHARS = 22  # ".t-<16 hex>.tmp" next to the file while it is written
MIN_LEAF_CHARS = 60
MIN_FOLDER_CHARS = 12


class FileStore:
    def __init__(self, data_dir: Path, max_path: int = MAX_PATH_CHARS):
        self.root = data_dir / "uni"
        self.max_path = max_path

    def _folder_names(self, names: list[str]) -> list[str]:
        """Folder names as usual, shortened evenly only when the path would get too long."""
        cleaned = [safe_name(name) for name in names]
        room = self.max_path - len(str(self.root)) - MIN_LEAF_CHARS - TEMPORARY_FILE_CHARS - len(cleaned) - 1
        if sum(map(len, cleaned)) <= room:
            return cleaned
        limit = max(MIN_FOLDER_CHARS, room // len(cleaned))
        return [safe_name(name, limit) for name in names]

    def save(
        self, data: bytes, semester: str, course: str, section: str,
        filename: str, version: int, sha256: str, now: datetime, source: str, source_key: str,
        existing_path: Path | None = None,
    ) -> Path:
        if self.digest(data) != sha256:
            raise ValueError("SHA-256 passt nicht zum Dateiinhalt")
        folder = ensure_directory(self.root, *self._folder_names([semester, course, section or "Sonstiges"]))
        original = safe_name(filename)
        stem = Path(original).stem
        suffix = Path(original).suffix
        source_id = hashlib.sha256(f"{source}\0{source_key}".encode()).hexdigest()[:10]
        head, tail = f"{now:%Y-%m-%d}_", f"_v{version}_{source_id}_{sha256[:16]}{suffix}"
        # Shorten the title, never the tail: it carries the version and the checksum.
        room = min(180, self.max_path - len(str(folder)) - 1 - TEMPORARY_FILE_CHARS) - len(head) - len(tail)
        leaf = safe_name(f"{head}{stem[:max(6, room)].rstrip('. ')}{tail}", 400)
        target = folder / leaf
        physical = native_path(target)
        if physical.is_symlink():
            raise FileExistsError("Dateiname ist bereits als symbolischer Link belegt")
        if physical.exists():
            if physical.is_file() and self.digest(physical.read_bytes()) == sha256:
                return target.relative_to(self.root.parent)
            raise FileExistsError(f"Dateiname bereits mit anderem Inhalt belegt: {target.name}")
        if existing_path is not None:
            physical_existing = native_path(existing_path)
            if self.digest(physical_existing.read_bytes()) != sha256:
                raise ValueError("Vorhandene Dateiversion hat einen falschen SHA-256")
            try:
                os.link(physical_existing, physical)
                return target.relative_to(self.root.parent)
            except FileExistsError:
                if not physical.is_symlink() and physical.is_file() and self.digest(physical.read_bytes()) == sha256:
                    return target.relative_to(self.root.parent)
                raise
            except OSError as exc:
                raise OSError("Gleicher Dateiinhalt kann nicht ohne Duplikat verknüpft werden") from exc
        write_once(target, data)
        return target.relative_to(self.root.parent)

    @staticmethod
    def digest(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()
