# SPDX-License-Identifier: AGPL-3.0-or-later

"""Adapt the append-only note store to block operations."""

from app.notes.store import read_note, update_note


class NoteBlockRepository:
    def __init__(self, factory, settings):
        self.factory, self.settings = factory, settings

    def read(self, note_id: str) -> tuple[int, str, str]:
        with self.factory() as session:
            note, _, body, _ = read_note(session, self.settings, note_id)
            return note.current_revision, note.title, body

    def save(self, note_id: str, expected_revision: int, title: str, body: str, guard) -> int:
        with self.factory() as session:
            note = update_note(session, self.settings, note_id, expected_revision=expected_revision,
                               title=title, body=body, before_commit=guard)
            return note.current_revision
