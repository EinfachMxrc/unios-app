# SPDX-License-Identifier: AGPL-3.0-or-later

"""Revision-checked block editing shared by the public action interfaces."""

from app.notes.block_repository import NoteBlockRepository
from app.notes.blocks import BlockEdit, edit_blocks, list_blocks
from app.notes.store import NoteConflict


class NoteBlockService:
    def __init__(self, repository: NoteBlockRepository, guard):
        self.repository, self.guard = repository, guard

    def read(self, note_id: str) -> dict:
        revision, _, body = self.repository.read(note_id)
        return {"revision": revision, "blocks": list_blocks(body)}

    def apply(self, note_id: str, edit: BlockEdit) -> dict:
        self.guard()
        revision, title, body = self.repository.read(note_id)
        if revision != edit.expected_revision:
            raise NoteConflict("Notiz wurde inzwischen verändert")
        updated = edit_blocks(body, edit)
        revision = self.repository.save(note_id, edit.expected_revision, title, updated, self.guard)
        return {"revision": revision, "blocks": list_blocks(updated)}
