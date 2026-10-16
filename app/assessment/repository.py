# SPDX-License-Identifier: AGPL-3.0-or-later
import hashlib
from datetime import UTC, datetime

from sqlalchemy import func, select, text, update

from app.assessment.timing import is_running
from app.coding.repository import Changed
from app.db.models import (
    AssessmentAttempt,
    AssessmentRequest,
    AssessmentReview,
    AssessmentSession,
    AssessmentTask,
    Course,
    Note,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.learning.topics import resolve_topic


class AssessmentRepository:
    def __init__(self, factory):
        self.factory = factory

    def get(self, model, identifier):
        with self.factory() as session:
            return session.get(model, identifier)

    def tasks(self, course_id=None, limit=100):
        with self.factory() as session:
            query = select(AssessmentTask)
            if course_id is not None:
                query = query.where(AssessmentTask.course_id == course_id)
            return session.scalars(query.order_by(AssessmentTask.id.desc()).limit(limit)).all()

    def request_tasks(self, identifier):
        with self.factory() as session:
            return session.scalars(select(AssessmentTask).where(AssessmentTask.payload['request_id'].as_integer() == identifier)
                                   .order_by(AssessmentTask.id).limit(30)).all()

    def source(self, course_id, scope):
        with self.factory() as session:
            if session.get(Course, course_id) is None:
                raise LookupError
            if scope is None:
                return {'source': None, 'text': '', 'hash': None}
            if scope.note_id:
                note = session.get(Note, scope.note_id)
                if note is None or note.course_id != course_id:
                    raise LookupError
                content = session.scalar(text('SELECT substr(body,1,16000) FROM notes_fts WHERE note_id=:id'), {'id': note.id})
                if not content:
                    raise LookupError
                reference = {'note_id': note.id, 'revision': note.current_revision, 'url': f'/notes?id={note.id}'}
            else:
                version = session.get(ResourceVersion, scope.version_id)
                resource = session.get(Resource, version.resource_id) if version else None
                if resource is None or resource.course_id != course_id or resource.group_category == 'other_group' or resource.removed_upstream:
                    raise LookupError
                rows = session.execute(select(ResourceText.page_number, ResourceText.markdown, ResourceText.text).where(
                    ResourceText.version_id == scope.version_id, ResourceText.page_number.between(scope.first_page, scope.last_page))
                    .order_by(ResourceText.page_number).limit(40)).all()
                content = '\n'.join(f'Page {row.page_number}\n{(row.markdown or row.text or "")[:4000]}' for row in rows if row.markdown or row.text)[:16000]
                if not content.strip():
                    raise LookupError
                reference = {**scope.model_dump(exclude_none=True), 'hash': version.sha256,
                             'url': f'/material/{version.id}?page={scope.first_page}'}
            return {'source': reference, 'text': content, 'hash': hashlib.sha256(content.encode()).hexdigest(),
                    'truncated': len(content) >= 16000}

    def create(self, row, guard):
        with self.factory() as session:
            request_id = row.payload.get('request_id') if isinstance(row, AssessmentTask) else None
            if request_id:
                result = session.execute(update(AssessmentRequest).where(AssessmentRequest.id == request_id,
                    AssessmentRequest.status == 'requested').values(id=request_id))
                if result.rowcount != 1:
                    raise Changed
            session.add(row)
            if request_id:
                session.flush()
                count = session.scalar(select(func.count(AssessmentTask.id)).where(
                    AssessmentTask.payload['request_id'].as_integer() == request_id))
                if count >= 6:
                    session.execute(update(AssessmentRequest).where(AssessmentRequest.id == request_id).values(status='ready'))
            guard()
            session.commit()
            session.refresh(row)
            return row

    def accept(self, identifier, guard):
        with self.factory() as session:
            result = session.execute(update(AssessmentTask).where(AssessmentTask.id == identifier, AssessmentTask.status == 'proposed')
                                     .values(status='active'))
            if result.rowcount != 1:
                raise Changed
            row = session.get(AssessmentTask, identifier)
            row.topic_id = resolve_topic(session, row.course_id, row.payload['topic']).id
            guard()
            session.commit()

    def locked(self, session, task_id):
        rows = session.scalars(select(AssessmentSession).where(AssessmentSession.state == 'running')).all()
        now = datetime.now(UTC)
        # An exam whose time ran out no longer holds its tasks, even before the student finishes it.
        return any(task_id in row.task_ids and row.ends_at.replace(tzinfo=UTC) > now for row in rows)

    def hint(self, task_id, level, guard):
        with self.factory() as session:
            # Lock task before checking sessions/attempts to serialize writer races.
            session.execute(update(AssessmentTask).where(AssessmentTask.id == task_id).values(id=task_id))
            if self.locked(session, task_id):
                raise Changed
            session.execute(update(AssessmentTask).where(AssessmentTask.id == task_id)
                            .values(highest_hint=func.max(AssessmentTask.highest_hint, level)))
            guard()
            session.commit()

    def answer(self, task_id, payload, report, guard):
        with self.factory() as session:
            session.execute(update(AssessmentTask).where(AssessmentTask.id == task_id).values(id=task_id))
            task = session.get(AssessmentTask, task_id)
            if task.status != 'active':
                raise Changed
            if payload.session_id:
                exam = session.get(AssessmentSession, payload.session_id)
                if (exam is None or exam.state != 'running' or task_id not in exam.task_ids
                        or exam.ends_at.replace(tzinfo=UTC) <= datetime.now(UTC)):
                    raise Changed
                existing = session.scalar(select(AssessmentAttempt.id).where(AssessmentAttempt.task_id == task_id,
                                                                           AssessmentAttempt.session_id == exam.id))
                if existing:
                    raise Changed
            elif self.locked(session, task_id):
                raise Changed
            row = AssessmentAttempt(task_id=task_id, course_id=task.course_id, title=task.title, session_id=payload.session_id,
                                    answer=payload.model_dump(), report=report, hint_level=0 if payload.session_id else task.highest_hint)
            session.add(row)
            guard()
            session.commit()
            session.refresh(row)
            return row

    def attempts(self, task_id=None, course_id=None, hide_running=False):
        with self.factory() as session:
            query = select(AssessmentAttempt)
            if task_id is not None:
                query = query.where(AssessmentAttempt.task_id == task_id)
            if course_id is not None:
                query = query.where(AssessmentAttempt.course_id == course_id)
            if hide_running:
                query = query.where((AssessmentAttempt.session_id.is_(None)) | ~AssessmentAttempt.session_id.in_(
                    select(AssessmentSession.id).where(AssessmentSession.state == 'running',
                                                       AssessmentSession.ends_at > datetime.now(UTC).replace(tzinfo=None))))
            return session.scalars(query.order_by(AssessmentAttempt.id.desc()).limit(1000)).all()

    def requests(self):
        with self.factory() as session:
            return session.scalars(select(AssessmentRequest).where(AssessmentRequest.status == 'requested')
                                   .order_by(AssessmentRequest.id).limit(50)).all()

    def reviews(self, ids):
        with self.factory() as session:
            return session.scalars(select(AssessmentReview).where(AssessmentReview.attempt_id.in_(ids))
                                   .order_by(AssessmentReview.id.desc()).limit(100)).all()

    def feedback(self, attempt_id, guard):
        with self.factory() as session:
            row = session.get(AssessmentAttempt, attempt_id)
            exam = session.get(AssessmentSession, row.session_id) if row and row.session_id else None
            if row is None or exam and is_running(exam):
                raise Changed
            row.feedback_requested = True
            guard()
            session.commit()

    def review(self, attempt_id, payload, guard):
        with self.factory() as session:
            result = session.execute(update(AssessmentAttempt).where(AssessmentAttempt.id == attempt_id,
                                     AssessmentAttempt.feedback_requested.is_(True)).values(feedback_requested=False))
            if result.rowcount != 1:
                raise Changed
            row = AssessmentReview(attempt_id=attempt_id, feedback=payload.model_dump())
            session.add(row)
            guard()
            session.commit()
            session.refresh(row)
            return row

    def accept_review(self, identifier, guard):
        with self.factory() as session:
            result = session.execute(update(AssessmentReview).where(AssessmentReview.id == identifier,
                                     AssessmentReview.status == 'proposed').values(status='approved'))
            if result.rowcount != 1:
                raise Changed
            guard()
            session.commit()

    def start_exam(self, row, guard):
        with self.factory() as session:
            for identifier in sorted(row.task_ids):
                session.execute(update(AssessmentTask).where(AssessmentTask.id == identifier).values(id=identifier))
                task = session.get(AssessmentTask, identifier)
                if task is None or task.status != 'active' or task.highest_hint or self.locked(session, identifier):
                    raise Changed
            session.add(row)
            guard()
            session.commit()
            session.refresh(row)
            return row

    def finish_exam(self, identifier, guard):
        with self.factory() as session:
            result = session.execute(update(AssessmentSession).where(AssessmentSession.id == identifier,
                                     AssessmentSession.state == 'running').values(state='submitted'))
            if result.rowcount != 1:
                raise Changed
            guard()
            session.commit()

    def exam_attempts(self, identifier):
        with self.factory() as session:
            return session.scalars(select(AssessmentAttempt).where(AssessmentAttempt.session_id == identifier)).all()

    def running_exams(self):
        with self.factory() as session:
            return session.scalars(select(AssessmentSession).where(AssessmentSession.state == 'running')
                                   .order_by(AssessmentSession.id.desc()).limit(30)).all()

    def tasks_by_ids(self, identifiers):
        with self.factory() as session:
            return session.scalars(select(AssessmentTask).where(AssessmentTask.id.in_(identifiers))).all()
