# SPDX-License-Identifier: AGPL-3.0-or-later

"""The action contract and dispatcher shared by REST, CLI, MCP and the UI."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError

from app.assessment.contracts import Create as AssessmentCreate
from app.assessment.contracts import Source as AssessmentSource
from app.assessment.contracts import TutorReview
from app.coding.contracts import CreatePractice, Review
from app.courses.repository import CourseRepository
from app.courses.service import CourseService
from app.entities.repository import get
from app.entities.schema import EntityKind
from app.notes.block_repository import NoteBlockRepository
from app.notes.block_service import NoteBlockService
from app.notes.blocks import BlockEdit
from app.submissions.service import latest_check


class EntityActionDefinition(BaseModel):
    id: str
    label: str
    entity_kind: EntityKind
    input_schema: dict[str, Any]
    requires_confirmation: bool
    capability: str
    handler: str
    mcp_allowed: bool = False


class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input: dict[str, Any] = {}
    dry_run: bool = False
    confirmed: bool = False


class EmptyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActivityInput(EmptyInput):
    active: bool
    expected: bool


@dataclass(frozen=True)
class RegisteredAction:
    definition: EntityActionDefinition
    input_model: type[BaseModel]
    run: Callable


def _activity(context, object_id, payload):
    return {"active": CourseService(CourseRepository(context.factory), context.coordinator)
            .set_activity(int(object_id), payload.active, payload.expected)}


def _submission(context, object_id, payload):
    check = latest_check(context.settings, int(object_id))
    # A saved observation is not a claim that Moodle has just been refreshed.
    return {"source": "saved", "check": check.model_dump(mode="json", include={
        "assignment_id", "checked_at", "status", "due_at", "warning",
    }) if check else None}


def _reextract(context, object_id, payload):
    return context.index_jobs.submit(int(object_id))


def _index_status(context, object_id, payload):
    return context.index_jobs.status(int(object_id))


def _cancel_index(context, object_id, payload):
    return context.index_jobs.cancel(int(object_id))


def _note_blocks(context, object_id, payload):
    return NoteBlockService(NoteBlockRepository(context.factory, context.settings),
                            context.coordinator.assert_writer).read(object_id)


def _edit_note_block(context, object_id, payload):
    return NoteBlockService(NoteBlockRepository(context.factory, context.settings),
                            context.coordinator.assert_writer).apply(object_id, payload)


def _assessment_create(context, object_id, payload):
    return context.assessment.create(int(object_id), payload)


def _assessment_source(context, object_id, payload):
    return context.assessment.source(int(object_id), payload)


def _assessment_describe(context, object_id, payload):
    return context.assessment.view(context.assessment.task(int(object_id)))


def _assessment_feedback(context, object_id, payload):
    return context.assessment.feedback_context(int(object_id))


def _assessment_review(context, object_id, payload):
    return context.assessment.review(int(object_id), payload)


def _assessment_progress(context, object_id, payload):
    return context.assessment.progress(int(object_id))


def _coding_create(context, object_id, payload):
    return context.coding.create(int(object_id), payload, proposed=True)


def _coding_describe(context, object_id, payload):
    return context.coding.task_view(context.coding.task(int(object_id)))


def _coding_feedback(context, object_id, payload):
    return context.coding.feedback_context(int(object_id))


def _coding_review(context, object_id, payload):
    return context.coding.review(int(object_id), payload)


def _coding_progress(context, object_id, payload):
    return context.coding.progress(int(object_id))


def _registered(action_id, label, kind, model, capability, handler, *, confirmation=False, mcp=False):
    return RegisteredAction(EntityActionDefinition(
        id=action_id, label=label, entity_kind=kind, input_schema=model.model_json_schema(),
        requires_confirmation=confirmation, capability=capability, handler=action_id,
        mcp_allowed=mcp,
    ), model, handler)


REGISTRY = {
    entry.definition.id: entry for entry in (
        _registered("course.set_activity", "Kursstatus ändern", "course", ActivityInput,
                    "courses.write", _activity, confirmation=True),
        _registered("assignment.submission_status", "Gespeicherten Abgabestatus lesen", "assignment", EmptyInput,
                    "submissions.read", _submission, mcp=True),
        _registered("resource.reextract", "Textindex erneuern", "resource", EmptyInput,
                    "materials.index", _reextract, confirmation=True),
        _registered("resource.index_status", "Textindex-Fortschritt", "resource", EmptyInput,
                    "materials.read", _index_status, mcp=True),
        _registered("resource.cancel_indexing", "Textindex abbrechen", "resource", EmptyInput,
                    "materials.index", _cancel_index, confirmation=True),
        _registered("note.blocks", "Notizblöcke lesen", "note", EmptyInput, "notes.read", _note_blocks, mcp=True),
        _registered("note.edit_block", "Notizblock bearbeiten", "note", BlockEdit, "notes.write", _edit_note_block,
                    confirmation=True),
        _registered('assessment.create', 'Lernaufgabe vorschlagen', 'course', AssessmentCreate,
                    'assessment.propose', _assessment_create, mcp=True),
        _registered('assessment.source_context', 'Gewählten Abschnitt lesen', 'course', AssessmentSource,
                    'assessment.read', _assessment_source, mcp=True),
        _registered('assessment.describe', 'Lernaufgabe lesen', 'assessment_task', EmptyInput,
                    'assessment.read', _assessment_describe, mcp=True),
        _registered('assessment.feedback_context', 'Angeforderte Antwort lesen', 'assessment_attempt', EmptyInput,
                    'assessment.read', _assessment_feedback, mcp=True),
        _registered('assessment.submit_review', 'Lernfeedback vorschlagen', 'assessment_attempt', TutorReview,
                    'assessment.propose', _assessment_review, mcp=True),
        _registered('assessment.progress', 'Lernstand nach Stufe lesen', 'course', EmptyInput,
                    'assessment.read', _assessment_progress, mcp=True),
        _registered('coding.create_practice', 'Coding-Aufgabe vorschlagen', 'course', CreatePractice,
                    'coding.propose', _coding_create, mcp=True),
        _registered('coding.next_practice', 'Nächste Coding-Aufgabe vorschlagen', 'course', CreatePractice,
                    'coding.propose', _coding_create, mcp=True),
        _registered('coding.describe', 'Coding-Aufgabe lesen', 'coding_task', EmptyInput,
                    'coding.read', _coding_describe, mcp=True),
        _registered('coding.feedback_context', 'Angefordertes Tutor-Paket lesen', 'coding_attempt', EmptyInput,
                    'coding.read', _coding_feedback, mcp=True),
        _registered('coding.submit_review', 'Tutor-Feedback vorschlagen', 'coding_attempt', Review,
                    'coding.propose', _coding_review, mcp=True),
        _registered('coding.progress', 'Coding-Lernfortschritt lesen', 'course', EmptyInput,
                    'coding.read', _coding_progress, mcp=True),
    )
}


def action_definitions(kind: EntityKind | None = None) -> list[EntityActionDefinition]:
    return [item.definition for item in REGISTRY.values() if kind is None or item.definition.entity_kind == kind]


class EntityActions:
    def __init__(self, factory, settings, coordinator, index_jobs, coding=None, assessment=None):
        self.factory, self.settings = factory, settings
        self.coordinator, self.index_jobs = coordinator, index_jobs
        self.coding, self.assessment = coding, assessment

    def dispatch(self, kind: EntityKind, object_id: str, action_id: str, request: ActionRequest,
                 *, mcp: bool = False) -> dict:
        registered = REGISTRY.get(action_id)
        if registered is None or registered.definition.entity_kind != kind:
            raise HTTPException(404, "Aktion für diesen Objekttyp nicht gefunden")
        definition = registered.definition
        if mcp and not definition.mcp_allowed:
            raise HTTPException(403, "Diese Aktion ist nicht für KI-Assistenten freigegeben")
        try:
            payload = registered.input_model.model_validate(request.input)
        except ValidationError:
            raise HTTPException(422, "Eingabe entspricht nicht dem Aktionsschema") from None
        with self.factory() as session:
            if get(session, kind, object_id) is None:
                raise HTTPException(404, "Objekt nicht gefunden")
        if request.dry_run:
            return {"action": action_id, "dry_run": True, "input": payload.model_dump(),
                    "requires_confirmation": definition.requires_confirmation, "capability": definition.capability}
        if definition.requires_confirmation:
            if not request.confirmed:
                raise HTTPException(409, "Aktion muss ausdrücklich bestätigt werden")
            self.coordinator.assert_writer()
        try:
            result = registered.run(self, object_id, payload)
        except LookupError:
            raise HTTPException(404, "Objekt nicht gefunden") from None
        except ValueError:
            raise HTTPException(409, "Objekt wurde verändert; bitte erneut laden") from None
        return {"action": action_id, "dry_run": False, "result": result}
