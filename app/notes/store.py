# SPDX-License-Identifier: AGPL-3.0-or-later

"""Versioned block-document notes; SQLite indexes only the current revision.

New revisions are canonical JSON documents (`.json`). Older revisions are Markdown
files that stay untouched and are converted to blocks when read."""

import hashlib
import json
from collections.abc import Callable
from uuid import uuid4

from filelock import FileLock
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Course, Note, NoteVersion, Resource, utc_now
from app.extract.search import search_expression
from app.files.atomic import ensure_directory, write_once
from app.files.localpath import native_path, resolve_local
from app.files.store import safe_name
from app.notes.document import (
    Document,
    DocumentError,
    canonical_json,
    to_data,
    to_text,
    validate,
)
from app.notes.markdown import parse_markdown, render_markdown
from app.notes.wikilinks import refresh_incoming_wikilinks, sync_wikilinks


class NoteError(ValueError):
    pass


class NoteConflict(NoteError):
    pass


class NoteMissing(NoteError):
    pass


class NoteCorrupt(NoteError):
    pass


def _validate_relation(session: Session, course_id: int, resource_id: int | None) -> Course:
    course = session.get(Course, course_id)
    if course is None:
        raise NoteMissing("Kurs nicht gefunden")
    if resource_id is not None:
        resource = session.get(Resource, resource_id)
        if resource is None or resource.course_id != course_id:
            raise NoteError("Datei gehört nicht zu diesem Kurs")
    return course


def _clean_title(title: str) -> str:
    if len(title) > 200:
        raise NoteError("Notiztitel darf höchstens 200 Zeichen enthalten")
    title = title.strip()
    if not title or "\n" in title or "\r" in title:
        raise NoteError("Gültigen einzeiligen Titel angeben")
    return title


def _build_document(body: str, document: "Document | dict | None",
                    previous: Document | None = None) -> Document:
    """A document wins; Markdown (CLI, imports, scaffolds) is converted and keeps block ids."""
    try:
        if document is not None:
            return validate(document)
        if len(body) > 100_000:
            raise NoteError("Notiztext darf höchstens 100.000 Zeichen enthalten")
        return parse_markdown(body, previous=previous)
    except DocumentError as exc:
        raise NoteError(str(exc)) from exc


def _path_label(value: str) -> str:
    # Linux limits each filename to bytes, including the version/ID suffix.
    # Keep full titles in the database and Markdown header, shorten only paths.
    return safe_name(value, 70).encode("utf-8")[:200].decode("utf-8", errors="ignore").rstrip(". ")


def _write_revision(settings: Settings, course: Course, note_id: str,
                    revision: int, title: str, document: Document, resource_id: int | None) -> tuple[str, str]:
    root = settings.data_dir / "notes"
    folder = ensure_directory(root, f"{_path_label(course.name)}_{course.id}", note_id)
    target = folder / f"v{revision:04d}_{_path_label(title)}_{uuid4().hex[:8]}.json"
    envelope = {"format": "unios-note-blocks", "unios_note_id": note_id, "title": title,
                "course": course.name, "course_id": course.id, "resource_id": resource_id,
                "revision": revision, "document": to_data(document)}
    content = (json.dumps(envelope, ensure_ascii=False, sort_keys=True, indent=1) + "\n").encode("utf-8")
    write_once(target, content)
    return target.relative_to(settings.data_dir).as_posix(), hashlib.sha256(content).hexdigest()


def _read_text(settings: Settings, version: NoteVersion) -> str:
    root = resolve_local(settings.data_dir / "notes")
    target = native_path(settings.data_dir / version.relative_path)
    if target.is_symlink() or not resolve_local(target).is_relative_to(root):
        raise NoteCorrupt("Notizdatei liegt außerhalb der Notizablage")
    try:
        content = target.read_bytes()
    except OSError as exc:
        raise NoteCorrupt("Notizdatei fehlt oder ist nicht lesbar") from exc
    if hashlib.sha256(content).hexdigest() != version.sha256:
        raise NoteCorrupt("Notizdatei stimmt nicht mit der gespeicherten Prüfsumme überein")
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise NoteCorrupt("Notizdatei enthält ungültigen Text") from exc


def _legacy_body(version: NoteVersion, decoded: str) -> str:
    if decoded.startswith(f"---\nunios_note_id: {json.dumps(version.note_id)}\n"):
        _, delimiter, body = decoded.partition("\n---\n")
        if not delimiter:
            raise NoteCorrupt("Notiz-Metadaten sind unvollständig")
        return body.removeprefix("\n")
    return decoded


def _is_blocks(version: NoteVersion) -> bool:
    return version.relative_path.endswith(".json")


def _load_document(settings: Settings, version: NoteVersion) -> Document:
    decoded = _read_text(settings, version)
    if not _is_blocks(version):
        # Deterministic ids: the same legacy revision always converts to the same document.
        return parse_markdown(_legacy_body(version, decoded), seed=version.sha256)
    try:
        envelope = json.loads(decoded)
        if envelope.get("unios_note_id") != version.note_id:
            raise NoteCorrupt("Notiz-Metadaten passen nicht zur Notiz")
        return validate(envelope["document"])
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        if isinstance(exc, NoteCorrupt):
            raise
        raise NoteCorrupt("Notizdatei enthält ein ungültiges Dokument") from exc


def _read_revision(settings: Settings, version: NoteVersion) -> str:
    """Markdown view of a revision; legacy files are returned byte-for-byte."""
    if not _is_blocks(version):
        return _legacy_body(version, _read_text(settings, version))
    return render_markdown(_load_document(settings, version))


def _index(session: Session, note_id: str, title: str, body: str) -> None:
    session.execute(text("DELETE FROM notes_fts WHERE note_id = :id"), {"id": note_id})
    session.execute(text("INSERT INTO notes_fts(note_id, title, body) VALUES (:id, :title, :body)"),
                    {"id": note_id, "title": title, "body": body})


def create_note(session: Session, settings: Settings, *, course_id: int, resource_id: int | None,
                title: str, body: str = "", document: "Document | dict | None" = None,
                before_commit: Callable[[], None] | None = None) -> Note:
    title = _clean_title(title)
    content = _build_document(body, document)
    course = _validate_relation(session, course_id, resource_id)
    if before_commit is not None:
        before_commit()
    note_id = str(uuid4())
    path, digest = _write_revision(settings, course, note_id, 1, title, content, resource_id)
    now = utc_now()
    note = Note(id=note_id, course_id=course_id, resource_id=resource_id, title=title,
                current_revision=1, created_at=now, updated_at=now)
    session.add(note)
    session.add(NoteVersion(note_id=note_id, revision=1, title=title,
                            relative_path=path, sha256=digest, created_at=now))
    text_body = to_text(content)
    _index(session, note_id, title, text_body)
    title_index = sync_wikilinks(session, note, text_body)
    refresh_incoming_wikilinks(session, note_id, title_index)
    if before_commit is not None:
        before_commit()
    session.commit()
    return note


def update_note(session: Session, settings: Settings, note_id: str, *, expected_revision: int,
                title: str, body: str = "", document: "Document | dict | None" = None,
                before_commit: Callable[[], None] | None = None) -> Note:
    title = _clean_title(title)
    lock_folder = ensure_directory(settings.local_dir / "note-locks")
    with FileLock(lock_folder / f"{note_id}.lock", timeout=5):
        note = session.get(Note, note_id)
        if note is None:
            raise NoteMissing("Notiz nicht gefunden")
        if note.current_revision != expected_revision:
            raise NoteConflict("Notiz wurde inzwischen geändert; bitte neu laden")
        current = session.scalar(select(NoteVersion).where(NoteVersion.note_id == note_id,
                    NoteVersion.revision == note.current_revision))
        if current is None:
            raise NoteCorrupt("Aktuelle Notizversion fehlt")
        previous = _load_document(settings, current)
        content = _build_document(body, document, previous)
        if title == note.title and canonical_json(content) == canonical_json(previous):
            return note
        course = _validate_relation(session, note.course_id, note.resource_id)
        if before_commit is not None:
            before_commit()
        revision = note.current_revision + 1
        path, digest = _write_revision(settings, course, note_id, revision, title, content, note.resource_id)
        now = utc_now()
        session.add(NoteVersion(note_id=note_id, revision=revision, title=title,
                                relative_path=path, sha256=digest, created_at=now))
        from app.local_actions.repository import record

        record(session, "note", note_id, {"revision": note.current_revision}, revision, note.course_id)
        note.title = title
        note.current_revision = revision
        note.updated_at = now
        text_body = to_text(content)
        _index(session, note_id, title, text_body)
        title_index = sync_wikilinks(session, note, text_body)
        if title != current.title:
            refresh_incoming_wikilinks(session, note_id, title_index)
        if before_commit is not None:
            before_commit()
        session.commit()
        return note


def _select_version(session: Session, note_id: str, revision: int | None) -> tuple[Note, NoteVersion, list[NoteVersion]]:
    note = session.get(Note, note_id)
    if note is None:
        raise NoteMissing("Notiz nicht gefunden")
    versions = list(session.scalars(select(NoteVersion).where(NoteVersion.note_id == note_id)
                                    .order_by(NoteVersion.revision.desc())).all())
    selected = next((item for item in versions if item.revision == (revision or note.current_revision)), None)
    if selected is None:
        raise NoteMissing("Notizversion nicht gefunden")
    return note, selected, versions


def read_note(session: Session, settings: Settings, note_id: str,
              revision: int | None = None) -> tuple[Note, NoteVersion, str, list[NoteVersion]]:
    """Markdown view of a revision for CLI, export and text-based consumers."""
    note, selected, versions = _select_version(session, note_id, revision)
    return note, selected, _read_revision(settings, selected), versions


def read_note_document(session: Session, settings: Settings, note_id: str,
                       revision: int | None = None) -> tuple[Note, NoteVersion, Document, list[NoteVersion]]:
    note, selected, versions = _select_version(session, note_id, revision)
    return note, selected, _load_document(settings, selected), versions


def search_notes(session: Session, query: str, *, course_id: int | None = None,
                 semester_id: int | None = None, limit: int = 50) -> list[dict]:
    expression = search_expression(query)
    if not expression:
        return []
    rows = session.execute(text("""
        SELECT n.id, n.title, n.course_id, c.name AS course_name,
               s.name AS semester_name, n.current_revision AS revision,
               snippet(notes_fts, 2, '【', '】', '…', 18) AS excerpt
        FROM notes_fts
        JOIN notes AS n ON n.id = notes_fts.note_id
        JOIN courses AS c ON c.id = n.course_id
        LEFT JOIN semesters AS s ON s.id = c.semester_id
        WHERE notes_fts MATCH :expression
          AND (:course_id IS NULL OR c.id = :course_id)
          AND (:semester_id IS NULL OR s.id = :semester_id)
        ORDER BY bm25(notes_fts), n.updated_at DESC
        LIMIT :limit
    """), {"expression": expression, "course_id": course_id,
           "semester_id": semester_id, "limit": min(max(limit, 1), 100)}).mappings().all()
    return [dict(row) for row in rows]
