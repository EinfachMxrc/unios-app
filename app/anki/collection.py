# SPDX-License-Identifier: AGPL-3.0-or-later

"""Serialized access to the official Anki collection on the active host."""

from __future__ import annotations

import atexit
import json
import os
import shutil
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import RLock

from anki.collection import (
    Collection,
    ExportAnkiPackageOptions,
    ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)
from anki.notes import NoteId

from app.anki.card_schema import CardOrigin, manual_note_marker, plain_card_html
from app.config import Settings
from app.host.snapshots import backup_sqlite_copy

_lock = RLock()
_study_collection: tuple[Settings, Collection] | None = None
_study_file_identity: tuple[int, int] | None = None
_FIELDS = ("Course", "Topic", "Semester", "SourceFile", "SourcePage", "CreatedAt", "UniOSId")


def mode_path(settings: Settings) -> Path:
    return settings.data_dir / "anki" / "mode.json"


def study_mode(settings: Settings) -> str:
    path = mode_path(settings)
    if not path.exists():
        return "external"
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("mode") not in {"external", "integrated"}:
        raise ValueError("Ungültiger Anki-Modus")
    return str(value["mode"])


def write_study_mode(settings: Settings, mode: str) -> None:
    if mode not in {"external", "integrated"}:
        raise ValueError("Ungültiger Anki-Modus")
    close_study_collection()
    path = mode_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("x", encoding="utf-8") as output:
        json.dump({"mode": mode}, output)
        output.flush()
    temporary.replace(path)


def collection_path(settings: Settings) -> Path:
    return settings.local_dir / "anki" / "collection.anki2"


def snapshot_collection(settings: Settings, target: Path) -> bool:
    """Snapshot only an existing collection, without opening or changing its scheduler."""
    with _lock:
        close_study_collection()
        path = collection_path(settings)
        if not path.is_file():
            return False
        if path.is_symlink():
            raise ValueError("Ungültiger Anki-Ablagepfad")
        # Anki uses its own Unicode collation. Validate through its actual backend,
        # in a disposable directory so media-cache files never leak into exports.
        with TemporaryDirectory(prefix="unios-anki-snapshot-") as directory:
            working = Path(directory) / "collection.anki2"
            backup_sqlite_copy(path, working, integrity_validator=_snapshot_integrity)
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with working.open("rb") as source, os.fdopen(descriptor, "wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
                output.flush()
                os.fsync(output.fileno())
        return True


def _snapshot_integrity(path: Path) -> bool:
    collection = Collection(str(path))
    try:
        assert collection.db is not None
        return collection.db.scalar("PRAGMA quick_check") == "ok"
    finally:
        collection.close()


def close_study_collection(settings: Settings | None = None) -> None:
    """Finish receipts before releasing Anki's ephemeral native undo manager."""
    global _study_collection, _study_file_identity
    with _lock:
        if _study_collection is not None:
            current_settings, col = _study_collection
            if settings is not None and collection_path(current_settings) != collection_path(settings):
                return
            from app.anki.study_undo_repository import materialize_receipts

            try:
                materialize_receipts(current_settings, col)
            finally:
                col.close()
                _study_collection = None
                _study_file_identity = None


atexit.register(close_study_collection)


@contextmanager
def open_collection(settings: Settings, *, ensure_fsrs: bool = True,
                    preserve_study_undo: bool = False,
                    access_guard: Callable[[], None] | None = None) -> Iterator[Collection]:
    """Anki's SQLite/Rust backend must never have concurrent local writers."""
    global _study_collection, _study_file_identity
    with _lock:
        if access_guard is not None:
            access_guard()
        path = collection_path(settings)
        path.parent.mkdir(parents=True, exist_ok=True)
        existing_stat = path.stat() if path.exists() else None
        file_identity = (existing_stat.st_dev, existing_stat.st_ino) if existing_stat else None
        if _study_collection is not None and (not preserve_study_undo or
                collection_path(_study_collection[0]) != path or file_identity != _study_file_identity):
            close_study_collection()
        col = _study_collection[1] if _study_collection is not None else Collection(str(path))
        if preserve_study_undo:
            _study_collection = settings, col
            opened_stat = path.stat()
            _study_file_identity = opened_stat.st_dev, opened_stat.st_ino
        try:
            if ensure_fsrs and col.get_config("fsrs") is not True:
                col.set_config("fsrs", True)
            yield col
        finally:
            if not preserve_study_undo:
                col.close()


def ensure_notetype(col: Collection, card_type: str):
    name = "UniOS Cloze" if card_type == "cloze" else "UniOS Basic"
    existing = col.models.by_name(name)
    if existing is not None:
        return existing
    if card_type == "cloze":
        built_in = col.models.by_name("Cloze")
        assert built_in is not None
        model = col.models.copy(built_in, add=False)
        model["name"] = name
        # The built-in Cloze type already has the required Text and Back Extra fields.
    else:
        model = col.models.new(name)
        for field in ("Front", "Back"):
            col.models.add_field(model, col.models.new_field(field))
        template = col.models.new_template("Karte")
        template["qfmt"] = "{{Front}}"
        template["afmt"] = "{{FrontSide}}<hr id=answer>{{Back}}"
        col.models.add_template(model, template)
    for field in _FIELDS:
        col.models.add_field(model, col.models.new_field(field))
    col.models.add(model)
    return model


def add_approved_note(col: Collection, *, queue_id: int, card_type: str, front: str, back: str,
                      course: str, topic: str, semester: str, source_file: str, source_page: int | None,
                      origin: CardOrigin = "ai", mutation_id: str | None = None) -> int:
    """Import one approved proposal; UniOSId makes retries after a crash safe."""
    if origin == "manual" and (mutation_id is None or card_type != "basic"):
        raise ValueError("Eigene Karte benötigt eine stabile Kennung und Basic-Inhalt")
    marker = manual_note_marker(mutation_id) if origin == "manual" and mutation_id else f"unios-{queue_id}"
    matches = col.find_notes(f'"UniOSId:{marker}"')
    if origin == "manual":
        matches = [note_id for note_id in matches if col.get_note(NoteId(note_id))["UniOSId"] == marker]
    if len(matches) > 1:
        raise ValueError("Mehrere Anki-Notizen für dieselbe Kartenkennung; bitte prüfen")
    if matches:
        return int(matches[0])
    model = ensure_notetype(col, card_type)
    note = col.new_note(model)
    note["Text" if card_type == "cloze" else "Front"] = plain_card_html(front) if origin == "manual" else front
    note["Back Extra" if card_type == "cloze" else "Back"] = plain_card_html(back) if origin == "manual" else back
    for field, value in {
        "Course": course, "Topic": topic, "Semester": semester,
        "SourceFile": source_file, "SourcePage": str(source_page or ""),
        "CreatedAt": datetime.now(UTC).isoformat(), "UniOSId": marker,
    }.items():
        note[field] = plain_card_html(value) if origin == "manual" else value
    from app.anki.api import _slug

    note.tags = [f"uni::{_slug(course)}::{_slug(topic)}", f"semester::{_slug(semester)}"]
    deck_id = col.decks.id(f"Uni::{course}")
    assert deck_id is not None
    col.add_note(note, deck_id)
    return int(note.id)


def export_package(col: Collection, path: Path) -> None:
    col.export_anki_package(
        out_path=str(path),
        options=ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True,
                                         with_media=True, legacy=False),
        limit=None,
    )


def import_package(col: Collection, path: Path) -> None:
    col.import_anki_package(ImportAnkiPackageRequest(
        package_path=str(path),
        options=ImportAnkiPackageOptions(merge_notetypes=True, with_scheduling=True,
                                         with_deck_configs=True),
    ))
