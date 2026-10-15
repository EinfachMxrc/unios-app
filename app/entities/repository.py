# SPDX-License-Identifier: AGPL-3.0-or-later

"""Storage adapters for the public entity catalog."""

from typing import Any

from sqlalchemy import select

from app.db.models import (
    AssessmentAttempt,
    AssessmentTask,
    Assignment,
    CodingAttempt,
    CodingTask,
    Course,
    Exam,
    Exercise,
    Jot,
    LearningTopic,
    Note,
    Project,
    Resource,
)
from app.entities.schema import EntityKind, describe

MODELS: dict[EntityKind, Any] = {
    "course": Course, "resource": Resource, "jot": Jot, "note": Note,
    "project": Project, "topic": LearningTopic, "assignment": Assignment,
    "exam": Exam, "exercise": Exercise, "assessment_task": AssessmentTask, "assessment_attempt": AssessmentAttempt, "coding_task": CodingTask, "coding_attempt": CodingAttempt,
}


def get(session, kind: EntityKind, object_id: str):
    schema = describe(kind)
    if schema.id_type == "integer":
        if not object_id.isdecimal() or int(object_id) < 1:
            return None
        key: int | str = int(object_id)
    else:
        key = object_id
    return session.get(MODELS[kind], key)


def list_items(session, kind: EntityKind, *, offset: int, limit: int):
    model = MODELS[kind]
    query = select(model).order_by(model.id).offset(offset).limit(limit)
    if kind == "project":
        query = query.where(Project.archived_at.is_(None))
    return session.scalars(query).all()


def search(session, kind: EntityKind, term: str, limit: int = 8, offset: int = 0):
    model = MODELS[kind]
    title_field = describe(kind).fields[1].name
    query = select(model).where(getattr(model, title_field).contains(term, autoescape=True)).order_by(
        model.id).offset(offset).limit(limit)
    if kind == "project":
        query = query.where(Project.archived_at.is_(None))
    return session.scalars(query).all()
