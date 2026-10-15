# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.collections import repository
from app.collections.schema import (
    CollectionConfig,
    CollectionInput,
    CollectionResult,
    CollectionUpdate,
    CollectionView,
    GroupBy,
    Kind,
    Sort,
    View,
)
from app.collections.service import _apply, _config, _results, _view
from app.config import Settings
from app.db.models import SmartCollection, utc_now
from app.host.lease import HostCoordinator


def collections_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/collections")

    @router.get("", response_model=list[CollectionView])
    def list_collections():
        with factory() as session:
            rows = repository.list_saved(session)
            return [_view(item) for item in rows]

    @router.get("/preview", response_model=CollectionResult)
    def preview(kind: Kind, view: View = "list", course_id: int | None = None,
                days: int | None = None, max_percent: int | None = None,
                own_group_only: bool = False, include_unmeasured: bool = True, sort: Sort = "date",
                tag: str | None = None, priority: Literal["low", "medium", "high"] | None = None,
                exam_relevant: bool | None = None,
                difficulty: Literal["easy", "medium", "hard"] | None = None,
                workflow_status: Literal["open", "working", "done"] | None = None,
                group_by: GroupBy = "status", any_groups: str = "[]",
                sort_direction: Literal["auto", "asc", "desc"] = "auto",
                visible_fields: str = '["title","course","date","status"]',
                time_filter: Literal["all", "upcoming", "overdue"] = "all",
                unread_only: bool = False, has_questions: bool = False,
                submission_filter: Literal["all", "unsubmitted"] = "all"):
        try:
            if len(any_groups) > 4000 or len(visible_fields) > 200:
                raise ValueError("Zu viele Filter")
            config = CollectionConfig(kind=kind, view=view, course_id=course_id, days=days,
                                      max_percent=max_percent, own_group_only=own_group_only,
                                      include_unmeasured=include_unmeasured, sort=sort,
                                      tag=tag, priority=priority, exam_relevant=exam_relevant,
                                      difficulty=difficulty, workflow_status=workflow_status,
                                      group_by=group_by, any_groups=json.loads(any_groups), sort_direction=sort_direction,
                                      visible_fields=json.loads(visible_fields), time_filter=time_filter,
                                      unread_only=unread_only, has_questions=has_questions,
                                      submission_filter=submission_filter)
        except (ValidationError, ValueError) as exc:
            raise HTTPException(422, "Ungültige Filter") from exc
        with factory() as session:
            return _results(session, settings, config)

    @router.post("", response_model=CollectionView)
    def create_collection(payload: CollectionInput):
        coordinator.assert_writer()
        if not payload.name.strip():
            raise HTTPException(400, "Name fehlt")
        with factory() as session:
            if payload.config.course_id is not None and repository.get_course(session, payload.config.course_id) is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            item = SmartCollection(name="", kind=payload.config.kind, view=payload.config.view,
                                   revision=1, created_at=utc_now(), updated_at=utc_now())
            _apply(item, payload.name, payload.config)
            repository.add(session, item)
            repository.commit(session)
            return _view(item)

    @router.get("/{collection_id}/results", response_model=CollectionResult)
    def saved_results(collection_id: int):
        with factory() as session:
            item = repository.get_saved(session, collection_id)
            if item is None or item.archived:
                raise HTTPException(404, "Ansicht nicht gefunden")
            return _results(session, settings, _config(item))

    @router.put("/{collection_id}", response_model=CollectionView)
    def update_collection(collection_id: int, payload: CollectionUpdate):
        coordinator.assert_writer()
        if not payload.name.strip():
            raise HTTPException(400, "Name fehlt")
        with factory() as session:
            item = repository.get_saved(session, collection_id)
            if item is None or item.archived:
                raise HTTPException(404, "Ansicht nicht gefunden")
            if item.revision != payload.expected_revision:
                raise HTTPException(409, "Ansicht wurde inzwischen geändert")
            if payload.config.course_id is not None and repository.get_course(session, payload.config.course_id) is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            _apply(item, payload.name, payload.config)
            item.revision += 1
            repository.commit(session)
            return _view(item)

    @router.post("/{collection_id}/archive", status_code=204)
    def archive_collection(collection_id: int):
        coordinator.assert_writer()
        with factory() as session:
            item = repository.get_saved(session, collection_id)
            if item is None:
                raise HTTPException(404, "Ansicht nicht gefunden")
            item.archived = True
            item.updated_at = utc_now()
            repository.commit(session)

    return router
