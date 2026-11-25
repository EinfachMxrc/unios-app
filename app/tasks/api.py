# SPDX-License-Identifier: AGPL-3.0-or-later
"""HTTP routes for personal tasks. Trashing and restoring live with the trash."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.host.lease import HostCoordinator
from app.tasks.service import (
    TaskConflict,
    TaskMissing,
    TaskService,
    TaskStatus,
    TaskView,
)


class TaskInput(BaseModel):
    id: UUID
    title: str = Field(min_length=1, max_length=300)
    notes: str = Field(default="", max_length=20_000)
    due_on: date | None = None
    course_id: int | None = Field(default=None, ge=1)


class TaskChange(BaseModel):
    expected_revision: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=300)
    notes: str | None = Field(default=None, max_length=20_000)
    status: TaskStatus | None = None
    due_on: date | None = None
    course_id: int | None = Field(default=None, ge=1)


class TasksView(BaseModel):
    tasks: list[TaskView]


def tasks_router(service: TaskService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/tasks")

    @router.get("", response_model=TasksView)
    def list_tasks():
        return {"tasks": service.list()}

    @router.post("", response_model=TaskView, status_code=201)
    def create_task(payload: TaskInput):
        coordinator.assert_writer()
        try:
            return service.create(str(payload.id), payload.title, payload.notes, payload.due_on, payload.course_id)
        except TaskConflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None

    @router.patch("/{task_id}", response_model=TaskView)
    def change_task(task_id: UUID, payload: TaskChange):
        coordinator.assert_writer()
        changes = payload.model_dump(exclude_unset=True, exclude={"expected_revision"})
        try:
            return service.change(str(task_id), payload.expected_revision, changes)
        except TaskMissing as exc:
            raise HTTPException(404, str(exc)) from None
        except TaskConflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None

    return router
