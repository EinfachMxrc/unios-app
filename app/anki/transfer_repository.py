# SPDX-License-Identifier: AGPL-3.0-or-later

"""Queue/context reads and SQL acknowledgements for native Anki transfer."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    Course,
    LearningTopic,
    Resource,
    Semester,
)
from app.db.session import begin_write_transaction


class TransferRepository:
    def __init__(self, factory: Callable[[], Session]):
        self._factory = factory

    @contextmanager
    def transaction(self, *, write: bool = False) -> Iterator[Session]:
        with self._factory() as session:
            if write:
                begin_write_transaction(session)
            yield session
            if write:
                session.commit()

    def target(self, session: Session, queue_id: int) -> tuple[AnkiCardQueue, Resource | None, Course] | None:
        row = session.execute(select(AnkiCardQueue, Resource, Course)
                              .outerjoin(Resource, Resource.id == AnkiCardQueue.resource_id)
                              .outerjoin(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id)
                              .join(Course, Course.id == func.coalesce(Resource.course_id, LearningTopic.course_id))
                              .where(or_(Resource.id.is_not(None), AnkiCardQueue.origin == "manual"))
                              .where(AnkiCardQueue.id == queue_id)).one_or_none()
        return (row[0], row[1], row[2]) if row is not None else None

    def approved_ids(self) -> list[int]:
        with self.transaction() as session:
            return list(session.scalars(select(AnkiCardQueue.id)
                                       .outerjoin(Resource, Resource.id == AnkiCardQueue.resource_id)
                                       .outerjoin(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id)
                                       .join(Course, Course.id == func.coalesce(Resource.course_id, LearningTopic.course_id))
                                       .where(AnkiCardQueue.status == "approved",
                                              or_(Resource.id.is_not(None), AnkiCardQueue.origin == "manual"),
                                              or_(Resource.id.is_(None), Resource.group_category != "other_group"))
                                       .order_by(AnkiCardQueue.id)).all())

    def bindings(self, session: Session, queue_id: int) -> list[AnkiCard]:
        return list(session.scalars(select(AnkiCard).where(AnkiCard.queue_id == queue_id)).all())

    def binding_for_note(self, session: Session, note_id: int) -> AnkiCard | None:
        return session.scalar(select(AnkiCard).where(AnkiCard.note_id == str(note_id)))

    def semester_name(self, session: Session, course: Course) -> str:
        semester = session.get(Semester, course.semester_id) if course.semester_id else None
        return semester.name if semester else "unbekannt"

    def acknowledge(self, session: Session, item: AnkiCardQueue, note_id: int,
                    existing: AnkiCard | None) -> None:
        if existing is None:
            session.add(AnkiCard(queue_id=item.id, note_id=str(note_id)))
        else:
            existing.note_id = str(note_id)
        item.status = "pushed"
        session.flush()
