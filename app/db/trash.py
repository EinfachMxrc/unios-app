# SPDX-License-Identifier: AGPL-3.0-or-later

"""Notes and quick captures in the trash are hidden from every ORM query.

A trashed row keeps its data until the trash is emptied, so it can come back
unchanged. Rather than repeat ``deleted_at IS NULL`` in every query (and miss
one), each ORM select gets that criterion for both models. Code that has to see
trashed rows (the trash itself, restoring, purging, the lecture-note sync that
must not recreate a deleted note) opts out with ``INCLUDE_TRASHED``.

Raw SQL is not covered; it reads the full-text tables, which hold no row for a
trashed item.
"""

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.db.models import Jot, Note

TRASH_OPTION = "include_trashed"
INCLUDE_TRASHED = {TRASH_OPTION: True}


@event.listens_for(Session, "do_orm_execute")
def _hide_trashed(state: ORMExecuteState) -> None:
    if not state.is_select or state.is_column_load or state.is_relationship_load:
        return
    if state.execution_options.get(TRASH_OPTION, False):
        return
    state.statement = state.statement.options(
        with_loader_criteria(Note, lambda cls: cls.deleted_at.is_(None), include_aliases=True),
        with_loader_criteria(Jot, lambda cls: cls.deleted_at.is_(None), include_aliases=True),
    )
