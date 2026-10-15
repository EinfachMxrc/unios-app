# SPDX-License-Identifier: AGPL-3.0-or-later
"""Storage and compare-and-swap boundaries for coding practice."""

from datetime import timedelta

from sqlalchemy import func, select, update

from app.db.models import (
    BackgroundJob,
    CodingAttempt,
    CodingDraft,
    CodingReview,
    CodingTask,
    Course,
    LearningTopic,
    utc_now,
)
from app.learning.topics import resolve_topic


class Changed(Exception):
    pass


class RunLimited(Exception):
    pass


class CodingRepository:
    def __init__(self, factory):
        self.factory = factory

    def valid_scope(self, course_id, topic_id):
        with self.factory() as session:
            if session.get(Course, course_id) is None:
                return False
            topic = session.get(LearningTopic, topic_id) if topic_id else None
            return topic_id is None or topic is not None and topic.course_id == course_id

    def get(self, model, identifier):
        with self.factory() as session:
            return session.get(model, identifier)

    def insert(self, row, guard, topic_name=None):
        with self.factory() as session:
            if topic_name and row.topic_id is None:
                row.topic_id = resolve_topic(session, row.course_id, topic_name).id
            session.add(row)
            guard()
            session.commit()
            session.refresh(row)
            return row

    def tasks(self, course_id, after=0, limit=50):
        with self.factory() as session:
            query = select(CodingTask).where(CodingTask.id > after)
            if course_id is not None:
                query = query.where(CodingTask.course_id == course_id)
            return session.scalars(query.order_by(CodingTask.id).limit(limit)).all()

    def task_state(self, identifier, expected, state, guard, topic_name=None):
        with self.factory() as session:
            result = session.execute(update(CodingTask).where(CodingTask.id == identifier, CodingTask.status == expected)
                                     .values(status=state, updated_at=utc_now()))
            if result.rowcount != 1:
                raise Changed
            row = session.get(CodingTask, identifier)
            if topic_name and row.topic_id is None:
                row.topic_id = resolve_topic(session, row.course_id, topic_name).id
            guard()
            session.commit()

    def save_draft(self, task_id, revision, files, guard):
        with self.factory() as session:
            result = session.execute(update(CodingTask).where(CodingTask.id == task_id, CodingTask.status == 'active',
                                     CodingTask.draft_revision == revision).values(draft_revision=revision + 1, updated_at=utc_now()))
            if result.rowcount != 1:
                raise Changed
            session.add(CodingDraft(task_id=task_id, revision=revision + 1, files=files))
            guard()
            session.commit()
            return revision + 1

    def draft(self, task_id):
        with self.factory() as session:
            return session.scalar(select(CodingDraft).where(CodingDraft.task_id == task_id)
                                  .order_by(CodingDraft.revision.desc()).limit(1))

    def hint(self, task_id, level, guard):
        with self.factory() as session:
            session.execute(update(CodingTask).where(CodingTask.id == task_id)
                            .values(highest_hint=func.max(CodingTask.highest_hint, level), updated_at=utc_now()))
            guard()
            session.commit()

    def attempts(self, task_id, limit=20):
        with self.factory() as session:
            return session.scalars(select(CodingAttempt).where(CodingAttempt.task_id == task_id)
                                   .order_by(CodingAttempt.id.desc()).limit(limit)).all()

    def reserve_attempt(self, task, files, guard):
        with self.factory() as session:
            # Acquiring the SQLite write lock before checking avoids two concurrent runs.
            result = session.execute(update(CodingTask).where(CodingTask.id == task.id, CodingTask.status == 'active')
                                     .values(updated_at=utc_now()))
            if result.rowcount != 1:
                raise Changed
            active = session.scalar(select(CodingAttempt.id).where(CodingAttempt.task_id == task.id,
                                    CodingAttempt.state.in_(['queued', 'running'])).limit(1))
            if active:
                raise Changed
            recent = session.scalar(select(func.count(CodingAttempt.id)).where(
                CodingAttempt.created_at >= utc_now() - timedelta(minutes=1)))
            if recent >= 3:
                raise RunLimited
            current = session.get(CodingTask, task.id)
            row = CodingAttempt(task_id=task.id, course_id=task.course_id, title=task.title,
                                files=files, hint_level=current.highest_hint)
            session.add(row)
            guard()
            session.commit()
            session.refresh(row)
            return row

    def attempt_update(self, identifier, guard, **values):
        with self.factory() as session:
            row = session.get(CodingAttempt, identifier)
            if row is None:
                raise LookupError
            for name, value in values.items():
                setattr(row, name, value)
            row.updated_at = utc_now()
            guard()
            session.commit()

    def recover(self, guard):
        with self.factory() as session:
            session.execute(update(CodingAttempt).where(CodingAttempt.state.in_(['queued', 'running']))
                            .values(state='interrupted', updated_at=utc_now()))
            guard()
            session.commit()

    def reviews(self, attempt_ids):
        with self.factory() as session:
            return session.scalars(select(CodingReview).where(CodingReview.attempt_id.in_(attempt_ids))
                                   .order_by(CodingReview.id.desc()).limit(50)).all()

    def accept_review(self, identifier, guard):
        with self.factory() as session:
            result = session.execute(update(CodingReview).where(CodingReview.id == identifier, CodingReview.status == 'proposed')
                                     .values(status='approved'))
            if result.rowcount != 1:
                raise Changed
            guard()
            session.commit()

    def propose_review(self, identifier, payload, guard):
        with self.factory() as session:
            changed = session.execute(update(CodingAttempt).where(
                CodingAttempt.id == identifier, CodingAttempt.state == 'completed',
                CodingAttempt.feedback_requested.is_(True), CodingAttempt.feedback_level >= payload.level,
            ).values(feedback_requested=False, updated_at=utc_now()))
            if changed.rowcount != 1:
                raise Changed
            row = CodingReview(attempt_id=identifier, **payload.model_dump())
            session.add(row)
            guard()
            session.commit()
            session.refresh(row)
            return row

    def feedback_queue(self):
        with self.factory() as session:
            return session.scalars(select(CodingAttempt).where(CodingAttempt.feedback_requested.is_(True),
                                   CodingAttempt.state == 'completed').order_by(CodingAttempt.id).limit(50)).all()

    def history(self, course_id):
        with self.factory() as session:
            query = select(CodingAttempt.id, CodingAttempt.state, CodingAttempt.report, CodingAttempt.hint_level,
                           CodingTask.template, CodingTask.topic_id).join(CodingTask, CodingAttempt.task_id == CodingTask.id)
            if course_id is not None:
                query = query.where(CodingAttempt.course_id == course_id)
            total = session.scalar(select(func.count()).select_from(query.subquery()))
            rows = session.execute(query.order_by(CodingAttempt.id.desc()).limit(1000)).all()
            return total, rows

    def job(self, attempt_id):
        with self.factory() as session:
            return session.scalar(select(BackgroundJob).where(BackgroundJob.kind == 'coding', BackgroundJob.target_id == attempt_id)
                                  .order_by(BackgroundJob.created_at.desc()).limit(1))
