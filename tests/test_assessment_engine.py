# SPDX-License-Identifier: AGPL-3.0-or-later
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.assessment import math, registry
from app.assessment.contracts import Answer, Create, Source, StartExam, TutorReview
from app.assessment.repository import AssessmentRepository
from app.assessment.service import AssessmentService
from app.coding.contracts import Hint
from app.db.models import (
    AssessmentAttempt,
    AssessmentSession,
    Course,
    Resource,
    ResourceText,
    ResourceVersion,
)


@pytest.fixture
def assessment(factory, coordinator):
    with factory() as session:
        course = Course(source='fixture', source_id='assessment', name='Synthetic mathematics')
        session.add(course)
        session.commit()
        identifier = course.id
    return AssessmentService(AssessmentRepository(factory), coordinator), identifier


@pytest.mark.parametrize('raw', ['__import__("os")', 'x.__class__', '[x for x in range(3)]', 'x^99', '(x^6)^6', '2^(2^6)', '1/0', 'sin(x)', 'y+1', 'True'])
def test_math_never_evaluates_arbitrary_text(raw):
    with pytest.raises((ValueError, SyntaxError, TypeError)):
        math.polynomial(raw)


def test_math_alternate_working_derivatives_and_incorrect_step():
    report = math.grade('2*x^2-8*x+6', 'roots', '3,1', ['x^2-4*x+3=0', '(x-1)*(x-3)=0'])
    assert report['correct'] and report['steps_complete'] and not report['rules_checked']
    report = math.grade('2*x^2-8*x+6', 'roots', '1,3', ['x^2-4*x+4=0'])
    assert report['correct'] and report['errors'] == ['math_transformation']
    assert math.grade('3*x^3+2*x', 'derivative', '2+9*x*x', [])['correct']
    assert math.grade('(x+1)^2', 'equivalent', 'x*x+2*x+1', [])['correct']
    assert not math.grade('x^2-1', 'roots', '1', [])['correct']
    assert math.grade('x^2-1', 'roots', '-1,1', ['use a graph'])['steps'][0]['equivalent'] is None


@pytest.mark.parametrize('kind,choices,expected,answer', [
    ('multiple_choice', ['LIFO', 'FIFO'], 'LIFO', 'LIFO'),
    ('parsons', ['return max;', 'int max = 0;'], '[1,0]', '[1,0]'),
    ('ordering', ['third', 'first', 'second'], '[1,2,0]', '[1,2,0]'),
    ('matching', ['Stack', 'Queue'], '["LIFO","FIFO"]', '["LIFO","FIFO"]'),
    ('numeric', [], '1/2', '0.5'),
])
def test_registry_objective_checkers(kind, choices, expected, answer):
    task = Create(type=kind, title='Fixture', question='Question', choices=choices, expected=expected)
    registry.validate(task)
    assert registry.grade(task.model_dump(), Answer(text=answer, confidence=3))['correct']
    assert not registry.grade(task.model_dump(), Answer(text='wrong', confidence=3))['correct']


def test_proposal_acceptance_subjective_review_never_changes_grade(assessment):
    service, course = assessment
    task = service.create(course, Create(type='free_recall', title='Explain', question='Explain recursion', concepts=['base case']))
    assert task['status'] == 'proposed' and 'expected' not in task and 'concepts' not in task
    with pytest.raises(HTTPException):
        service.answer(task['id'], Answer(text='base case', confidence=4))
    service.accept(task['id'])
    answer = service.answer(task['id'], Answer(text='An explanation', confidence=4))
    assert answer['report']['correct'] is None
    service.feedback(answer['id'])
    context = service.feedback_context(answer['id'])
    assert context['concepts'] == ['base case'] and 'pronunciation' in context['instruction']
    review = service.review(answer['id'], TutorReview(feedback='Add a termination explanation', concepts_met=['base case'], followup='Why does recursion stop?'))
    service.accept_review(review['id'])
    assert service.repository.get(AssessmentAttempt, answer['id']).report == answer['report']
    assert service.progress(course)['topics'][0]['objective_attempts'] == 0
    with pytest.raises(ValidationError):
        TutorReview(feedback='not allowed', correct=True)


def test_exam_hides_results_and_hints_prevents_replays_and_expiry(assessment, factory):
    service, course = assessment
    tasks = [service.create(course, Create(type='numeric', title=str(index), question='Number', expected='2')) for index in range(2)]
    for task in tasks:
        service.accept(task['id'])
    exam = service.start_exam(StartExam(task_ids=[task['id'] for task in tasks], minutes=1, confirmed=True))
    task_id = tasks[0]['id']
    with pytest.raises(HTTPException):
        service.hint(task_id, Hint(level=4, reveal_solution=True))
    result = service.answer(task_id, Answer(text='2', confidence=5, session_id=exam['id']))
    assert result['report'] == {} and service.progress(course)['topics'] == []
    with pytest.raises(HTTPException):
        service.answer(task_id, Answer(text='2', confidence=5, session_id=exam['id']))
    with pytest.raises(HTTPException):
        service.feedback(result['id'])
    with factory() as session:
        row = session.get(AssessmentSession, exam['id'])
        row.ends_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    with pytest.raises(HTTPException):
        service.answer(tasks[1]['id'], Answer(text='2', confidence=5, session_id=exam['id']))
    report = service.finish_exam(exam['id'])['report']
    assert report['points'] == 50 and report['unanswered'] == 1 and report['grade'] is None


def test_error_confidence_and_hints_are_tracked(assessment):
    service, course = assessment
    task = service.create(course, Create(type='numeric', title='Fraction', question='Number', expected='1/2', hints=['A fraction']))
    service.accept(task['id'])
    answer = service.answer(task['id'], Answer(text='2', confidence=5))
    assert answer['report']['misconception']
    service.hint(task['id'], Hint(level=1))
    service.answer(task['id'], Answer(text='0.5', confidence=2))
    progress = service.progress(course)['topics'][0]
    assert progress['correct'] == 1 and progress['misconceptions'] == 1 and progress['without_hints'] == 0


def test_pdf_requests_are_bounded_pinned_and_course_checked(assessment, factory):
    service, course = assessment
    with factory() as session:
        resource = Resource(source='fixture', source_key='pdf', course_id=course, kind='pdf', name='Synthetic.pdf', url='https://example.invalid')
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256='a' * 64, relative_path='never-open.pdf', size=10, mime_type='application/pdf')
        session.add(version)
        session.flush()
        session.add_all([ResourceText(version_id=version.id, page_number=number, text='Synthetic', markdown=f'Page {number} only') for number in [1, 2, 3]])
        session.commit()
        version_id = version.id
    scope = Source(version_id=version_id, first_page=2, last_page=2)
    request = service.request_source(course, scope)
    text = service.source(course, scope)['text']
    assert 'Page 2 only' in text and 'Page 1 only' not in text and 'Page 3 only' not in text
    task = service.create(course, Create(type='free_recall', title='Pinned', question='Explain page two', source=scope, request_id=request['id']))
    assert task['provenance']['source']['first_page'] == 2
    with pytest.raises(HTTPException):
        service.create(course, Create(type='free_recall', title='Wrong', question='Page one', source=Source(version_id=version_id), request_id=request['id']))
    with pytest.raises(ValidationError):
        Source(version_id=version_id, first_page=1, last_page=100)
    for number in range(5):
        service.create(course, Create(type='free_recall', title=f'Pinned {number}', question='Explain page two', source=scope, request_id=request['id']))
    assert service.requested_source(request['id'])['status'] == 'ready'
    with pytest.raises(HTTPException) as error:
        service.create(course, Create(type='free_recall', title='Seventh', question='Explain', source=scope, request_id=request['id']))
    assert error.value.status_code == 409


def test_agent_learning_proposals_require_category_scope_and_course(assessment, factory, settings, coordinator):
    from hashlib import sha256
    from hmac import new

    from fastapi.testclient import TestClient

    from app.db.models import AiAccess
    from app.main import create_app

    _, course = assessment
    settings.mcp_enabled = True
    settings.mcp_token = 'synthetic-tutor-' + 'x' * 40
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    payload = {'kind': 'course', 'object_id': str(course), 'action_id': 'assessment.create',
               'input': {'type': 'numeric', 'title': 'Synthetic proposal', 'question': 'One half', 'expected': '1/2'}}
    path = '/api/ai/mcp/v2/act'
    headers = {'X-UniOS-MCP-Token': settings.mcp_token}
    with TestClient(app) as client:
        assert client.post(path, json=payload, headers=headers).status_code == 403
        with factory() as session:
            session.add(AiAccess(key='category:coding_tutor', allowed=True))
            session.commit()
        actor = 'synthetic-tutor'
        def scopes(value):
            headers.update({'X-UniOS-MCP-Client': actor, 'X-UniOS-MCP-Scopes': value,
                'X-UniOS-MCP-Client-Signature': new(settings.mcp_token.encode(),
                    f'mcp-client:{actor}:scopes:{value}'.encode(), sha256).hexdigest()})
        scopes('mcp actions:read jobs:read')
        assert client.post(path, json=payload, headers=headers).status_code == 403
        scopes('mcp actions:read jobs:read coding:propose')
        response = client.post(path, json=payload, headers=headers)
        assert response.status_code == 200, response.text
        assert 'proposed' in response.text
        assert client.post('/api/ai/mcp/v2/jobs', json={}, headers=headers).status_code == 200
        with factory() as session:
            session.add(AiAccess(key=f'course:{course}', allowed=False))
            session.commit()
        assert client.post(path, json=payload, headers=headers).status_code == 403


def test_root_tasks_need_rational_roots_a_student_can_actually_type():
    def create(expression):
        return Create(type='symbolic_math', title='Nullstellen', question='Löse', math_operation='roots',
                      expression=expression)

    registry.validate(create('x^2-1'))
    for unsolvable in ('x^2-2', 'x^2+1'):
        with pytest.raises(ValueError, match='MATH_ROOTS'):
            registry.validate(create(unsolvable))


def test_an_expired_exam_stops_locking_its_tasks(assessment, factory):
    service, _course_id = assessment
    repository = service.repository
    with factory() as session:
        session.add(AssessmentSession(task_ids=[7], ends_at=datetime.now(UTC) + timedelta(minutes=5), state='running'))
        session.add(AssessmentSession(task_ids=[8], ends_at=datetime.now(UTC) - timedelta(minutes=5), state='running'))
        session.commit()
        assert repository.locked(session, 7) is True
        assert repository.locked(session, 8) is False


def test_an_expired_exam_releases_attempts_reports_and_feedback(assessment, factory):
    service, course = assessment
    task = service.create(course, Create(type='numeric', title='t', question='Number', expected='2'))
    service.accept(task['id'])
    exam = service.start_exam(StartExam(task_ids=[task['id']], minutes=1, confirmed=True))
    result = service.answer(task['id'], Answer(text='2', confidence=5, session_id=exam['id']))
    assert result['report'] == {}
    assert service.repository.attempts(course_id=course, hide_running=True) == []
    with pytest.raises(HTTPException):
        service.feedback(result['id'])
    with factory() as session:
        session.get(AssessmentSession, exam['id']).ends_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    # State is still 'running': the student never ended the exam.
    attempts = service.repository.attempts(course_id=course, hide_running=True)
    assert [row.id for row in attempts] == [result['id']]
    with factory() as session:
        attempt = session.get(AssessmentAttempt, result['id'])
    assert service.attempt_view(attempt)['report'] != {}
    service.feedback(result['id'])
