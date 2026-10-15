# SPDX-License-Identifier: AGPL-3.0-or-later

"""Describe what is known about a task without guessing its remote status."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.peek.repository import PeekRepository
from app.timeutil import as_utc


class PeekView(BaseModel):
    kind: Literal["assignment", "deadline"]
    id: int
    title: str
    course_id: int | None
    course_name: str | None
    due_at: datetime | None
    source: str
    removed_upstream: bool
    latest_submission_state: str | None
    assignment_id: int | None
    open_url: str


class PeekService:
    def __init__(self, repository: PeekRepository):
        self.repository = repository

    def assignment(self, assignment_id: int) -> PeekView | None:
        row = self.repository.assignment(assignment_id)
        if row is None:
            return None
        assignment, course, attempt = row
        return PeekView(kind="assignment", id=assignment.id, title=assignment.title,
                        course_id=course.id, course_name=course.name,
                        due_at=as_utc(assignment.due_at) if assignment.due_at else None,
                        source=assignment.source, removed_upstream=assignment.removed_upstream,
                        latest_submission_state=attempt.state if attempt else None,
                        assignment_id=assignment.id,
                        open_url=f"/courses/{course.id}#assignment-{assignment.id}")

    def deadline(self, deadline_id: int) -> PeekView | None:
        row = self.repository.deadline(deadline_id)
        if row is None:
            return None
        deadline, course = row
        return PeekView(kind="deadline", id=deadline.id, title=deadline.title,
                        course_id=course.id if course else None,
                        course_name=course.name if course else None,
                        due_at=as_utc(deadline.due_at), source=deadline.source,
                        removed_upstream=False, latest_submission_state=None,
                        assignment_id=deadline.assignment_id,
                        open_url=(f"/courses/{course.id}#assignment-{deadline.assignment_id}"
                                  if course and deadline.assignment_id else "/deadlines"))
