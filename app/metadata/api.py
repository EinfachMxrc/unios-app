# SPDX-License-Identifier: AGPL-3.0-or-later

"""Small, typed metadata layer over existing study objects."""

import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.db.models import (
    Assignment,
    Deadline,
    Exam,
    LearningTopic,
    MaterialAnnotation,
    Note,
    ObjectMetadata,
    Project,
    Resource,
    utc_now,
)
from app.host.lease import HostCoordinator

ObjectType = Literal["note", "material", "topic", "deadline", "question", "assignment", "exam", "project"]
Priority = Literal["low", "medium", "high"]
Difficulty = Literal["easy", "medium", "hard"]
WorkflowStatus = Literal["open", "working", "done"]


class MetadataInput(BaseModel):
    tags: list[str] = Field(default_factory=list, max_length=12)
    priority: Priority | None = None
    exam_relevant: bool | None = None
    difficulty: Difficulty | None = None
    workflow_status: WorkflowStatus | None = None
    expected_revision: int = Field(ge=0)

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        for value in values:
            tag = value.strip().lstrip("#").casefold()
            if not 1 <= len(tag) <= 40 or not re.fullmatch(r"[\w-]+", tag, re.UNICODE):
                raise ValueError("Tags brauchen 1–40 Zeichen ohne Leerzeichen")
            if tag not in result:
                result.append(tag)
        return result


class MetadataView(BaseModel):
    object_type: ObjectType
    object_id: str
    tags: list[str]
    priority: Priority | None
    exam_relevant: bool | None
    difficulty: Difficulty | None
    workflow_status: WorkflowStatus | None
    revision: int


def _target(session, kind: ObjectType, object_id: str) -> None:
    if kind in {"material", "topic", "deadline", "assignment", "exam", "project"}:
        if not object_id.isdigit():
            raise HTTPException(404, "Eintrag nicht gefunden")
        key: str | int = int(object_id)
    else:
        key = object_id
    model = {"note": Note, "material": Resource, "topic": LearningTopic,
             "deadline": Deadline, "question": MaterialAnnotation,
             "assignment": Assignment, "exam": Exam, "project": Project}[kind]
    item = session.get(model, key)
    if item is None:
        raise HTTPException(404, "Eintrag nicht gefunden")
    if kind == "material" and item.group_category == "other_group":
        raise HTTPException(404, "Eintrag nicht gefunden")
    if kind == "question":
        resource = session.get(Resource, item.resource_id)
        if resource is None or resource.group_category == "other_group":
            raise HTTPException(404, "Eintrag nicht gefunden")


def _view(kind: ObjectType, object_id: str, item: ObjectMetadata | None) -> MetadataView:
    return MetadataView.model_validate({"object_type": kind, "object_id": object_id,
        "tags": item.tags if item else [], "priority": item.priority if item else None,
        "exam_relevant": item.exam_relevant if item else None,
        "difficulty": item.difficulty if item else None,
        "workflow_status": item.workflow_status if item else None,
        "revision": item.revision if item else 0})


def metadata_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/metadata")

    @router.get("/tags", response_model=list[str])
    def list_tags():
        with factory() as session:
            result: set[str] = set()
            for tags in session.scalars(select(ObjectMetadata.tags)):
                result.update(tags)
            return sorted(result)

    @router.get("/{kind}/{object_id}", response_model=MetadataView)
    def get_metadata(kind: ObjectType, object_id: str):
        with factory() as session:
            _target(session, kind, object_id)
            item = session.scalar(select(ObjectMetadata).where(
                ObjectMetadata.object_type == kind, ObjectMetadata.object_id == object_id))
            return _view(kind, object_id, item)

    @router.put("/{kind}/{object_id}", response_model=MetadataView)
    def update_metadata(kind: ObjectType, object_id: str, payload: MetadataInput):
        coordinator.assert_writer()
        with factory() as session:
            _target(session, kind, object_id)
            item = session.scalar(select(ObjectMetadata).where(
                ObjectMetadata.object_type == kind, ObjectMetadata.object_id == object_id))
            revision = item.revision if item else 0
            if revision != payload.expected_revision:
                raise HTTPException(409, "Eigenschaften wurden inzwischen geändert")
            if item is None:
                item = ObjectMetadata(object_type=kind, object_id=object_id,
                                      revision=0, updated_at=utc_now())
                session.add(item)
            item.tags = payload.tags
            item.priority = payload.priority
            item.exam_relevant = payload.exam_relevant
            item.difficulty = payload.difficulty
            item.workflow_status = payload.workflow_status
            item.revision += 1
            item.updated_at = utc_now()
            session.commit()
            return _view(kind, object_id, item)

    return router
