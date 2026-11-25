# SPDX-License-Identifier: AGPL-3.0-or-later
"""Rules for personal tasks: repeatable creation, revision-safe edits, completion time."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.db.models import Task, utc_now
from app.tasks.repository import TaskRepository

TaskStatus = Literal["open", "doing", "done"]
DONE_LIMIT = 100


class TaskMissing(LookupError):
    pass


class TaskConflict(RuntimeError):
    pass


class TaskView(BaseModel):
    id: str
    title: str
    notes: str
    status: TaskStatus
    due_on: date | None
    course_id: int | None
    course_name: str | None
    revision: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


def _view(task: Task, course_name: str | None) -> TaskView:
    return TaskView.model_validate({
        "id": task.id, "title": task.title, "notes": task.notes, "status": task.status,
        "due_on": task.due_on, "course_id": task.course_id, "course_name": course_name,
        "revision": task.revision, "created_at": task.created_at, "updated_at": task.updated_at,
        "completed_at": task.completed_at,
    })


def _title(value: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned:
        raise ValueError("Die Aufgabe braucht einen Titel")
    return cleaned


class TaskService:
    def __init__(self, repository: TaskRepository):
        self.repository = repository

    def list(self) -> list[TaskView]:
        return [_view(task, name) for task, name in self.repository.listing(DONE_LIMIT)]

    def create(self, task_id: str, title: str, notes: str, due_on: date | None,
               course_id: int | None) -> TaskView:
        cleaned = _title(title)
        existing = self.repository.find(task_id)
        if existing is not None:
            # A retried request is fine; the same id with other content is not.
            task = existing[0]
            if task.deleted_at is None and (task.title, task.due_on, task.course_id) == (cleaned, due_on, course_id):
                return _view(*existing)
            raise TaskConflict("Diese Aufgabe gibt es bereits")
        self._check_course(course_id)
        now = utc_now()
        self.repository.add(Task(id=task_id, title=cleaned, notes=notes, status="open", due_on=due_on,
                                 course_id=course_id, revision=1, created_at=now, updated_at=now))
        return self._current(task_id)

    def change(self, task_id: str, expected_revision: int, changes: dict) -> TaskView:
        """``changes`` holds only the fields the caller sent, so ``due_on: None`` clears the date."""
        before = self._current(task_id)
        values = dict(changes)
        for required in ("title", "notes", "status"):
            if required in values and values[required] is None:
                raise ValueError("Dieses Feld darf nicht leer sein")
        if "title" in values:
            values["title"] = _title(values["title"])
        if "course_id" in values:
            self._check_course(values["course_id"])
        now = utc_now()
        if "status" in values and values["status"] != before.status:
            values["completed_at"] = now if values["status"] == "done" else None
        if not self.repository.update(task_id, expected_revision, {**values, "updated_at": now}):
            raise TaskConflict("Die Aufgabe wurde inzwischen geändert")
        return self._current(task_id)

    def _check_course(self, course_id: int | None) -> None:
        if course_id is not None and not self.repository.course_exists(course_id):
            raise ValueError("Kurs nicht gefunden")

    def _current(self, task_id: str) -> TaskView:
        found = self.repository.find(task_id)
        if found is None or found[0].deleted_at is not None:
            raise TaskMissing("Aufgabe nicht gefunden")
        return _view(*found)
