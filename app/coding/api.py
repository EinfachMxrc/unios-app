# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, Query

from app.coding import templates
from app.coding.contracts import Confirm, CreatePractice, Draft, Hint, Run
from app.coding.runner import RunnerUnavailable
from app.coding.views import (
    CodingAttemptView,
    CodingCatalogView,
    CodingDetailView,
    CodingDraftView,
    CodingHintView,
    CodingProgressView,
    CodingRunnerView,
    CodingRunView,
    CodingStatusView,
    CodingTasksView,
    CodingTaskView,
)


def coding_router(service, jobs):
    router = APIRouter(prefix='/api/learning/coding', tags=['coding-tutor'])

    @router.get('/templates', response_model=CodingCatalogView, response_model_exclude_unset=True)
    def catalogue():
        return {'version': templates.VERSION, 'languages': ['java', 'python', 'javascript'],
                'templates': [{'id': key, 'title': value[0], 'topic': value[1], 'contract': value[2]}
                              for key, value in templates.ENTRIES.items()]}

    @router.get('/runner', response_model=CodingRunnerView, response_model_exclude_unset=True)
    def runner_status():
        try:
            return service.backend.ready()
        except RunnerUnavailable as error:
            return {'ready': False, 'backend': 'judge0', 'code': str(error), 'languages': []}

    @router.get('/tasks', response_model=CodingTasksView, response_model_exclude_unset=True)
    def tasks(course_id: int | None = Query(default=None, gt=0), after: int = Query(default=0, ge=0),
              limit: int = Query(default=30, ge=1, le=50)):
        return service.list_tasks(course_id, after, limit)

    @router.post('/courses/{course_id}/tasks', status_code=201, response_model=CodingTaskView, response_model_exclude_unset=True)
    def create(course_id: int, payload: CreatePractice):
        return service.create(course_id, payload)

    @router.get('/tasks/{identifier}', response_model=CodingDetailView, response_model_exclude_unset=True)
    def detail(identifier: int):
        return service.detail(identifier)

    @router.post('/tasks/{identifier}/accept', response_model=CodingStatusView, response_model_exclude_unset=True)
    def accept(identifier: int, payload: Confirm):
        return service.transition(identifier, 'active')

    @router.post('/tasks/{identifier}/archive', response_model=CodingStatusView, response_model_exclude_unset=True)
    def archive(identifier: int, payload: Confirm):
        return service.transition(identifier, 'archived')

    @router.post('/tasks/{identifier}/draft', response_model=CodingDraftView, response_model_exclude_unset=True)
    def draft(identifier: int, payload: Draft):
        return service.draft(identifier, payload)

    @router.post('/tasks/{identifier}/run', status_code=202, response_model=CodingRunView, response_model_exclude_unset=True)
    def run(identifier: int, payload: Run):
        return service.run(identifier, payload, jobs)

    @router.post('/tasks/{identifier}/hint', response_model=CodingHintView, response_model_exclude_unset=True)
    def hint(identifier: int, payload: Hint):
        return service.hint(identifier, payload)

    @router.post('/attempts/{identifier}/feedback', status_code=202, response_model=CodingStatusView, response_model_exclude_unset=True)
    def feedback(identifier: int, payload: Hint):
        return service.request_feedback(identifier, payload.level)

    @router.get('/attempts/{identifier}', response_model=CodingAttemptView, response_model_exclude_unset=True)
    def attempt(identifier: int):
        return service.attempt(identifier)

    @router.post('/reviews/{identifier}/accept', response_model=CodingStatusView, response_model_exclude_unset=True)
    def accept_review(identifier: int, payload: Confirm):
        return service.accept_review(identifier)

    @router.get('/progress', response_model=CodingProgressView, response_model_exclude_unset=True)
    def progress(course_id: int | None = Query(default=None, gt=0)):
        return service.progress(course_id)

    return router
