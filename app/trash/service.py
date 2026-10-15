# SPDX-License-Identifier: AGPL-3.0-or-later

"""Putting notes and quick captures in the trash, bringing them back, erasing them.

Trashing keeps everything (revisions, files, links) and only takes the item out
of sight: ``deleted_at`` hides it from ORM queries (app.db.trash) and its
full-text row goes, so search, citations, wiki links and the agent no longer
find it. Restoring reverses exactly that. Erasing removes the rows, the links
and the note's revision files for good.
"""

import shutil
from datetime import datetime
from typing import Literal

from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Course, Jot, LinkEdge, Note, NoteVersion, VoiceMemo, utc_now
from app.db.trash import INCLUDE_TRASHED
from app.files.localpath import resolve_local
from app.notes.store import NoteMissing, read_note
from app.notes.wikilinks import refresh_incoming_wikilinks, sync_wikilinks

TrashKind = Literal["note", "jot"]


class TrashMissing(LookupError):
    pass


def _trashed_note(session: Session, note_id: str) -> Note:
    note = session.get(Note, note_id, execution_options=INCLUDE_TRASHED)
    if note is None or note.deleted_at is None:
        raise TrashMissing("Notiz liegt nicht im Papierkorb")
    return note


def _trashed_jot(session: Session, jot_id: str) -> Jot:
    jot = session.get(Jot, jot_id, execution_options=INCLUDE_TRASHED)
    if jot is None or jot.deleted_at is None:
        raise TrashMissing("Eintrag liegt nicht im Papierkorb")
    return jot


def trash_note(session: Session, note_id: str) -> Note:
    note = session.get(Note, note_id)
    if note is None:
        raise NoteMissing("Notiz nicht gefunden")
    note.deleted_at = utc_now()
    session.execute(text("DELETE FROM notes_fts WHERE note_id = :id"), {"id": note_id})
    session.flush()
    # Links in other notes that pointed here now show as unresolved.
    refresh_incoming_wikilinks(session, note_id)
    session.commit()
    return note


def restore_note(session: Session, settings: Settings, note_id: str) -> Note:
    note = _trashed_note(session, note_id)
    note.deleted_at = None
    session.flush()
    _, _, body, _ = read_note(session, settings, note_id)
    session.execute(text("INSERT INTO notes_fts(note_id, title, body) VALUES (:id, :title, :body)"),
                    {"id": note_id, "title": note.title, "body": body})
    title_index = sync_wikilinks(session, note, body)
    refresh_incoming_wikilinks(session, note_id, title_index)
    session.commit()
    return note


def _note_folders(settings: Settings, session: Session, note: Note):
    """The folder holding every revision file of one note, if it is safely inside the note store."""
    versions = session.scalars(select(NoteVersion).where(NoteVersion.note_id == note.id)).all()
    root = resolve_local(settings.data_dir / "notes")
    folders = {resolve_local(settings.data_dir / version.relative_path).parent for version in versions}
    return [folder for folder in folders
            if folder.name == note.id and folder.is_relative_to(root) and folder != root]


def erase_note(session: Session, settings: Settings, note_id: str) -> None:
    note = _trashed_note(session, note_id)
    folders = _note_folders(settings, session, note)
    session.execute(update(Jot).where(Jot.note_id == note_id).values(note_id=None)
                    .execution_options(**INCLUDE_TRASHED))
    session.execute(delete(LinkEdge).where(
        ((LinkEdge.from_type == "note") & (LinkEdge.from_id == note_id)) |
        ((LinkEdge.to_type == "note") & (LinkEdge.to_id == note_id))))
    session.execute(delete(NoteVersion).where(NoteVersion.note_id == note_id))
    session.delete(note)
    session.commit()
    # Files go last: a failed commit must not leave a note without its text.
    for folder in folders:
        shutil.rmtree(folder, ignore_errors=True)


def trash_jot(session: Session, jot_id: str) -> Jot:
    jot = session.get(Jot, jot_id)
    if jot is None:
        raise TrashMissing("Eintrag nicht gefunden")
    jot.deleted_at = utc_now()
    session.execute(text("DELETE FROM jots_fts WHERE jot_id = :id"), {"id": jot_id})
    session.commit()
    return jot


def restore_jot(session: Session, jot_id: str) -> Jot:
    jot = _trashed_jot(session, jot_id)
    jot.deleted_at = None
    session.execute(text("INSERT INTO jots_fts(jot_id, body) VALUES (:id, :body)"),
                    {"id": jot_id, "body": jot.body})
    session.commit()
    return jot


def erase_jot(session: Session, jot_id: str) -> None:
    jot = _trashed_jot(session, jot_id)
    session.execute(update(VoiceMemo).where(VoiceMemo.jot_id == jot_id).values(jot_id=None))
    session.execute(delete(LinkEdge).where(
        ((LinkEdge.from_type == "jot") & (LinkEdge.from_id == jot_id)) |
        ((LinkEdge.to_type == "jot") & (LinkEdge.to_id == jot_id))))
    session.delete(jot)
    session.commit()


def trash_items(session: Session) -> list[dict]:
    """Everything in the trash, most recently deleted first."""
    courses = {course.id: course.name for course in session.scalars(select(Course)).all()}
    items: list[tuple[datetime, dict]] = []
    for note in session.scalars(select(Note).where(Note.deleted_at.is_not(None))
                                .execution_options(**INCLUDE_TRASHED)):
        assert note.deleted_at is not None  # the query selects trashed notes only
        items.append((note.deleted_at, {"kind": "note", "id": note.id, "title": note.title,
                                        "course_id": note.course_id, "course_name": courses.get(note.course_id),
                                        "deleted_at": note.deleted_at}))
    for jot in session.scalars(select(Jot).where(Jot.deleted_at.is_not(None))
                               .execution_options(**INCLUDE_TRASHED)):
        assert jot.deleted_at is not None  # the query selects trashed captures only
        items.append((jot.deleted_at, {"kind": "jot", "id": jot.id, "title": jot.body[:200],
                                       "course_id": jot.course_id,
                                       "course_name": courses.get(jot.course_id) if jot.course_id else None,
                                       "deleted_at": jot.deleted_at}))
    return [item for _, item in sorted(items, key=lambda pair: pair[0], reverse=True)]


def empty_trash(session: Session, settings: Settings) -> int:
    erased = 0
    for item in trash_items(session):
        if item["kind"] == "note":
            erase_note(session, settings, item["id"])
        else:
            erase_jot(session, item["id"])
        erased += 1
    return erased
