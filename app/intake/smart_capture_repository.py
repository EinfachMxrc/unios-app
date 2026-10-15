# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local records used by Smart Capture; no classification rules live here."""

from sqlalchemy import select

from app.courses.classification import teaching_courses
from app.db.models import (
    Assignment,
    Course,
    Deadline,
    IntakeDecision,
    Jot,
    LinkEdge,
    Resource,
    utc_now,
)


class SmartCaptureRepository:
    def __init__(self, session):
        self.session = session

    def courses(self) -> list[Course]:
        return list(self.session.scalars(select(Course).where(teaching_courses())).all())

    def resources(self) -> list[Resource]:
        return list(self.session.scalars(select(Resource).where(Resource.removed_upstream.is_(False))).all())

    def assignment(self, jot_id: str) -> Assignment | None:
        return self.session.scalar(select(Assignment).where(
            Assignment.source == "smart_capture", Assignment.source_key == jot_id))

    def automatic_allowed(self, source_kind: str, source_id: str) -> bool:
        row = self.session.scalar(select(IntakeDecision).where(
            IntakeDecision.source_kind == source_kind, IntakeDecision.source_id == source_id))
        return row is None or row.state == "review"

    def save_task(self, jot: Jot, *, course_id: int, due_at, source_kind: str, source_id: str) -> Assignment:
        existing = self.assignment(jot.id)
        if existing is not None:
            return existing
        now = utc_now()
        task = Assignment(source="smart_capture", source_key=jot.id, course_id=course_id,
                          title=jot.body[:500], url=None, due_at=due_at,
                          last_seen_at=now, removed_upstream=False)
        self.session.add(task)
        self.session.flush()
        if due_at is not None:
            self.session.add(Deadline(source="smart_capture", source_key=jot.id, course_id=course_id,
                                      assignment_id=task.id, title=task.title, due_at=due_at,
                                      url=f"/courses/{course_id}#assignment-{task.id}"))
        self.session.add(LinkEdge(from_type="jot", from_id=jot.id, to_type="assignment",
                                  to_id=str(task.id), relation="related", created_at=now))
        self.decision(source_kind, source_id, state="accepted", course_id=course_id, assignment_id=task.id)
        return task

    def decision(self, source_kind: str, source_id: str, *, state: str,
                 course_id: int | None = None, assignment_id: int | None = None) -> None:
        row = self.session.scalar(select(IntakeDecision).where(
            IntakeDecision.source_kind == source_kind, IntakeDecision.source_id == source_id))
        if row is not None:
            if row.state == "review" and state == "accepted" and row.target_id is None:
                row.state = "accepted"
                row.course_id = course_id
                row.target_kind = "assignment"
                row.target_id = str(assignment_id)
                row.revision += 1
                row.updated_at = utc_now()
            return  # Other explicit decisions remain intact.
        now = utc_now()
        self.session.add(IntakeDecision(source_kind=source_kind, source_id=source_id,
                                        state=state, course_id=course_id,
                                        target_kind="assignment" if assignment_id else None,
                                        target_id=str(assignment_id) if assignment_id else None,
                                        revision=1, created_at=now, updated_at=now))
