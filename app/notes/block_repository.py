# SPDX-License-Identifier: AGPL-3.0-or-later

"""Adapt the append-only note store to block operations."""

from app.notes.document import Document
from app.notes.store import read_note_document, update_note


class NoteBlockRepository:
    def __init__(self, factory, settings):
        self.factory, self.settings = factory, settings

    def read(self, note_id: str) -> tuple[int, str, Document]:
        with self.factory() as session:
            note, _, document, _ = read_note_document(session, self.settings, note_id)
            return note.current_revision, note.title, document

    def save(self, note_id: str, expected_revision: int, title: str, document: Document, guard) -> int:
        with self.factory() as session:
            note = update_note(session, self.settings, note_id, expected_revision=expected_revision,
                               title=title, document=document, before_commit=guard)
            return note.current_revision
