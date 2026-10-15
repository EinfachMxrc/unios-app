# SPDX-License-Identifier: AGPL-3.0-or-later

"""Resolve frozen own-card sources by stable identity in one bounded SQL read."""

import logging
from collections.abc import Callable, Sequence
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.anki.manual_schema import ManualCardSource
from app.anki.note_schema import NoteCardSource
from app.db.models import AnkiCardQueue

log = logging.getLogger(__name__)
MANUAL_PREFIX = "unios-manual-"


class StudySourceRepository:
    def __init__(self, factory: Callable[[], Session]):
        self._factory = factory

    def for_identities(self, identities: Sequence[str | None]) -> dict[str, ManualCardSource | NoteCardSource]:
        identifiers: set[str] = set()
        for identity in identities:
            if not identity or not identity.startswith(MANUAL_PREFIX):
                continue
            candidate = identity.removeprefix(MANUAL_PREFIX)
            try:
                if str(UUID(candidate)) == candidate:
                    identifiers.add(candidate)
            except ValueError:
                continue
        if not identifiers:
            return {}
        with self._factory() as session:
            rows = session.execute(select(AnkiCardQueue.mutation_id, AnkiCardQueue.source_snapshot)
                                   .where(AnkiCardQueue.origin == "manual",
                                          AnkiCardQueue.mutation_id.in_(identifiers))).all()
        sources: dict[str, ManualCardSource | NoteCardSource] = {}
        for mutation_id, snapshot in rows:
            if not isinstance(snapshot, dict) or not isinstance(snapshot.get("source"), dict):
                continue
            try:
                source = snapshot["source"]
                sources[f"{MANUAL_PREFIX}{mutation_id}"] = (NoteCardSource.model_validate(source)
                    if source.get("kind") == "note" else ManualCardSource.model_validate(source))
            except ValidationError:
                # Imported/unmapped notes retain a null source, never a guessed latest PDF.
                log.warning("Ungültiger eigener Quellen-Snapshot")
        return sources
