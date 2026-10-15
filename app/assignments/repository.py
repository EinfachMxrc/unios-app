# SPDX-License-Identifier: AGPL-3.0-or-later
from sqlalchemy import select

from app.db.models import Assignment, Deadline
from app.timeutil import as_utc


class AssignmentRepository:
    def __init__(self, factory):
        self.factory = factory

    def unresolved(self):
        with self.factory() as session:
            return session.scalars(select(Assignment).where(
                Assignment.due_at.is_(None), Assignment.removed_upstream.is_(False),
                Assignment.due_note != "")).all()

    def confirm(self, assignment_id, due_at, expected_due_at, delivery, coordinator):
        with self.factory() as session:
            item = session.get(Assignment, assignment_id)
            if item is None or item.removed_upstream:
                raise LookupError("Aufgabe nicht gefunden")
            current = as_utc(item.due_at) if item.due_at else None
            if current != expected_due_at:
                raise ValueError("Der Termin wurde inzwischen geändert. Bitte neu laden.")
            item.due_at = due_at
            item.due_override = True
            item.due_origin = "confirmed"
            item.delivery = delivery
            deadline = session.scalar(select(Deadline).where(
                Deadline.source == item.source, Deadline.source_key == item.source_key))
            if deadline is None:
                deadline = Deadline(source=item.source, source_key=item.source_key, title=item.title, due_at=due_at)
                session.add(deadline)
            deadline.title = item.title
            deadline.due_at = due_at
            deadline.course_id = item.course_id
            deadline.assignment_id = item.id
            deadline.url = item.url
            deadline.removed_upstream = False
            coordinator.assert_writer()
            session.commit()
