# SPDX-License-Identifier: AGPL-3.0-or-later
from fastapi import APIRouter, Query

from app.assessment.contracts import Answer, Create, Source, StartExam
from app.assessment.views import (
    AssessmentAttemptView,
    AssessmentCatalogView,
    AssessmentDetailView,
    AssessmentExamsView,
    AssessmentExamView,
    AssessmentHintView,
    AssessmentProgressView,
    AssessmentRequestedSourceView,
    AssessmentRequestView,
    AssessmentSourceView,
    AssessmentStatusView,
    AssessmentTasksView,
    AssessmentTaskView,
)
from app.coding.contracts import Confirm, Hint


def assessment_router(service):
    router = APIRouter(prefix='/api/learning/assessment', tags=['assessment'])

    @router.get('/types', response_model=AssessmentCatalogView, response_model_exclude_unset=True)
    def types():
        return service.catalog()

    @router.get('/tasks', response_model=AssessmentTasksView, response_model_exclude_unset=True)
    def tasks(course_id: int | None = Query(default=None, gt=0)):
        return service.list_tasks(course_id)

    @router.post('/courses/{course_id}/tasks', status_code=201, response_model=AssessmentTaskView, response_model_exclude_unset=True)
    def create(course_id: int, payload: Create):
        return service.create(course_id, payload)

    @router.post('/courses/{course_id}/source', response_model=AssessmentSourceView, response_model_exclude_unset=True)
    def source(course_id: int, payload: Source):
        return service.source(course_id, payload)

    @router.post('/courses/{course_id}/requests', status_code=201, response_model=AssessmentRequestView, response_model_exclude_unset=True)
    def request_source(course_id: int, payload: Source):
        return service.request_source(course_id, payload)

    @router.get('/requests/{identifier}', response_model=AssessmentRequestedSourceView, response_model_exclude_unset=True)
    def requested_source(identifier: int):
        return service.requested_source(identifier)

    @router.get('/tasks/{identifier}', response_model=AssessmentDetailView, response_model_exclude_unset=True)
    def detail(identifier: int):
        return service.detail(identifier)

    @router.post('/tasks/{identifier}/accept', response_model=AssessmentStatusView, response_model_exclude_unset=True)
    def accept(identifier: int, payload: Confirm):
        return service.accept(identifier)

    @router.post('/tasks/{identifier}/definition', response_model=Create, response_model_exclude_unset=True)
    def definition(identifier: int, payload: Confirm):
        return service.review_definition(identifier)

    @router.post('/tasks/{identifier}/answer', status_code=201, response_model=AssessmentAttemptView, response_model_exclude_unset=True)
    def answer(identifier: int, payload: Answer):
        return service.answer(identifier, payload)

    @router.post('/tasks/{identifier}/hint', response_model=AssessmentHintView, response_model_exclude_unset=True)
    def hint(identifier: int, payload: Hint):
        return service.hint(identifier, payload)

    @router.post('/attempts/{identifier}/feedback', status_code=202, response_model=AssessmentStatusView, response_model_exclude_unset=True)
    def feedback(identifier: int, payload: Confirm):
        return service.feedback(identifier)

    @router.post('/reviews/{identifier}/accept', response_model=AssessmentStatusView, response_model_exclude_unset=True)
    def accept_review(identifier: int, payload: Confirm):
        return service.accept_review(identifier)

    @router.get('/progress', response_model=AssessmentProgressView, response_model_exclude_unset=True)
    def progress(course_id: int | None = Query(default=None, gt=0)):
        return service.progress(course_id)

    @router.post('/exams', status_code=201, response_model=AssessmentExamView, response_model_exclude_unset=True)
    def start_exam(payload: StartExam):
        return service.start_exam(payload)

    @router.get('/exams', response_model=AssessmentExamsView, response_model_exclude_unset=True)
    def running_exams():
        return service.running_exams()

    @router.get('/exams/{identifier}', response_model=AssessmentExamView, response_model_exclude_unset=True)
    def exam(identifier: int):
        return service.exam(identifier)

    @router.post('/exams/{identifier}/finish', response_model=AssessmentExamView, response_model_exclude_unset=True)
    def finish_exam(identifier: int, payload: Confirm):
        return service.finish_exam(identifier)

    return router
