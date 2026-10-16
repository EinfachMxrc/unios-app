# SPDX-License-Identifier: AGPL-3.0-or-later

"""Inverse local changes are new versions, guarded against concurrent edits."""

from datetime import datetime
from typing import cast

from fastapi import HTTPException
from pydantic import BaseModel

from app.calendar.edit_repository import CalendarEditRepository, adjustment_key
from app.calendar.edit_service import CalendarEditError, CalendarEdits
from app.calendar.selection import TimetableSelection
from app.db.models import utc_now
from app.entities.schema import EntityKind, EntityRef, RelationKind, catalog
from app.intake.repository import INTAKE_WRITE_LOCK
from app.links import service as links
from app.local_actions import repository, topic_repository
from app.notes.store import NoteError, read_note_document, update_note


class ActionView(BaseModel):
    id: str
    kind: str
    entity_id: str
    course_id: int | None
    created_at: datetime
    undone_at: datetime | None
    undoable: bool


def undoable(session, row, calendar_source=None):
    if row.undone_at:
        return False
    if row.kind == 'calendar':
        original = CalendarEditRepository.get(session, int(row.entity_id))
        if original is None or original.source not in {'calendar-personal', 'calendar-deleted', calendar_source}:
            return False
        adjustment = CalendarEditRepository.adjustment(session, adjustment_key(original))
        editor = CalendarEdits(None, None, calendar_source)
        if row.before.get('operation') == 'series':
            return editor._series_state(session, original)[3] == row.before['after']
        return editor._view(session, original, adjustment)['revision'] == row.before['after']
    if row.kind == "note":
        note = repository.note(session, row.entity_id)
        return note is not None and note.current_revision == row.expected_revision
    if row.kind == "intake":
        source = row.before["source_kind"]
        decision = repository.decision(session, source, row.entity_id)
        clip = repository.clip(session, row.entity_id) if source == "clip" else None
        return (decision is not None and decision.revision == row.expected_revision and
                ("clip" not in row.before or clip is not None and clip.revision == row.before["clip"]["expected"]))
    if row.kind == "relation":
        prior = row.before
        return prior["relation"] in {item.kind for item in catalog().relationships} and repository.matching_edge(session, prior) is None
    if row.kind == "topic_merge":
        return topic_repository.snapshot(session, row.before["ids"]) == row.before["after"]
    return False


class LocalActions:
    def __init__(self, factory, settings, coordinator):
        self.factory, self.settings, self.coordinator = factory, settings, coordinator

    def recent(self, course_id=None, kind=None, entity_id=None):
        with self.factory() as session:
            return [ActionView(id=row.id, kind=row.kind, entity_id=row.entity_id, course_id=row.course_id,
                               created_at=row.created_at, undone_at=row.undone_at,
                               undoable=undoable(session, row, TimetableSelection(self.settings).source))
                    for row in repository.recent(session, course_id, kind, entity_id)]

    def undo(self, identifier):
        self.coordinator.assert_writer()
        with self.factory() as session:
            action = repository.get(session, identifier)
            calendar_action = action is not None and action.kind == 'calendar'
        if calendar_action:
            try:
                CalendarEdits(self.factory, self.coordinator, TimetableSelection(self.settings).source).undo(identifier)
            except CalendarEditError as exc:
                raise HTTPException(exc.status, str(exc)) from None
            return {'ok': True}
        with INTAKE_WRITE_LOCK, self.factory() as session:
            # Serialize the revision check and inverse write with every SQLite
            # writer, including review/progress updates arriving concurrently.
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            row = repository.get(session, identifier)
            if row is None:
                raise HTTPException(404, "Änderung nicht gefunden")
            if not undoable(session, row):
                raise HTTPException(409, "Objekt wurde inzwischen geändert oder bereits wiederhergestellt")
            row.undone_at = utc_now()
            prior = row.before
            if row.kind == "note":
                try:
                    _, version, document, _ = read_note_document(session, self.settings, row.entity_id, prior["revision"])
                    update_note(session, self.settings, row.entity_id, expected_revision=row.expected_revision,
                                title=version.title, document=document, before_commit=self.coordinator.assert_writer)
                except NoteError:
                    raise HTTPException(409, "Notiz kann nicht sicher wiederhergestellt werden") from None
            elif row.kind == "intake":
                decision = repository.decision(session, prior["source_kind"], row.entity_id)
                for key, value in prior["decision"].items():
                    setattr(decision, key, datetime.fromisoformat(value) if key == "snoozed_until" and value else value)
                decision.revision += 1
                decision.updated_at = utc_now()
                if "clip" in prior:
                    clip = repository.clip(session, row.entity_id)
                    clip.course_id = prior["clip"]["course_id"]
                    clip.filed = prior["clip"]["filed"]
                    clip.revision += 1
                    clip.updated_at = utc_now()
                self.coordinator.assert_writer()
                repository.commit(session)
            elif row.kind == "topic_merge":
                topic_repository.restore(session, prior["ids"], prior["prior"])
                self.coordinator.assert_writer()
                repository.commit(session)
            else:
                links.create(session, EntityRef(type=cast(EntityKind, prior["from_type"]), id=prior["from_id"]),
                             EntityRef(type=cast(EntityKind, prior["to_type"]), id=prior["to_id"]),
                             cast(RelationKind, prior["relation"]))
            return {"ok": True}
