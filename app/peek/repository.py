# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read locally stored assignment and deadline context for peek panels."""

from sqlalchemy import select

from app.db.models import Assignment, Course, Deadline, SubmissionAttempt


class PeekRepository:
    def __init__(self, factory):
        self.factory = factory

    def assignment(self, assignment_id: int) -> tuple[Assignment, Course, SubmissionAttempt | None] | None:
        with self.factory() as session:
            assignment = session.get(Assignment, assignment_id)
            if assignment is None:
                return None
            course = session.get(Course, assignment.course_id)
            if course is None:
                return None
            attempt = session.scalar(select(SubmissionAttempt).where(
                SubmissionAttempt.assignment_id == assignment_id)
                .order_by(SubmissionAttempt.created_at.desc()))
            return assignment, course, attempt

    def deadline(self, deadline_id: int) -> tuple[Deadline, Course | None] | None:
        with self.factory() as session:
            deadline = session.get(Deadline, deadline_id)
            if deadline is None or deadline.removed_upstream:
                return None
            course = session.get(Course, deadline.course_id) if deadline.course_id else None
            return deadline, course
