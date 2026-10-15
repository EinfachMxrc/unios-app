# SPDX-License-Identifier: AGPL-3.0-or-later
"""Note locks and immutable version reads for explicitly confirmed own cards."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from filelock import FileLock

from app.anki.manual_repository import ManualCardRepository, ManualCardTransaction
from app.db.models import Course, Note, NoteVersion
from app.db.session import begin_write_transaction
from app.files.atomic import ensure_directory
from app.notes.store import read_note


@dataclass(frozen=True)
class NoteCardRecords:
    note: Note
    version: NoteVersion
    course: Course | None
    body: str


class NoteCardTransaction(ManualCardTransaction):
    def note_source(self, note_id: str, revision: int) -> NoteCardRecords:
        note, version, body, _ = read_note(self._session, self._settings, note_id, revision)
        return NoteCardRecords(note, version, self._session.get(Course, note.course_id), body)


class NoteCardRepository(ManualCardRepository):
    @contextmanager
    def write_for_note(self, note_id: str) -> Iterator[NoteCardTransaction]:
        self._coordinator.assert_writer()
        folder = ensure_directory(self._settings.local_dir / "note-locks")
        with FileLock(folder / f"{note_id}.lock", timeout=5), self._factory() as session:
            self._coordinator.assert_writer()
            begin_write_transaction(session)
            yield NoteCardTransaction(session, self._settings, self._coordinator)
