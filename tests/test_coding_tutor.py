# SPDX-License-Identifier: AGPL-3.0-or-later
import base64
import io
import json
import zipfile
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select

from app.coding import templates
from app.coding.contracts import CreatePractice, Draft, Files, Hint, Review
from app.coding.repository import CodingRepository
from app.coding.runner import Execution, Judge0Backend, RunnerUnavailable
from app.coding.service import CodingService
from app.db.models import CodingAttempt, CodingDraft, CodingTask, Course, LearningTopic
from app.jobs.service import JobCancelled


class FixtureRunner:
    def __init__(self, template='reverse', wrong=False, status=3):
        self.template, self.wrong, self.status = template, wrong, status
        self.calls = 0

    def ready(self):
        return {'ready': True}

    def execute(self, language, files, values, check):
        check()
        self.calls += 1
        return Execution(self.status, json.dumps([] if self.wrong else templates.oracle(self.template, values)),
                         'fixture-console', 'fixture-compiler' if self.status == 6 else '', 12.5, 1000)


class Context:
    def __init__(self, attempt_id, fail_after=None):
        self.row = SimpleNamespace(target_id=attempt_id)
        self.fail_after, self.count = fail_after, 0

    def check(self):
        self.count += 1
        if self.fail_after and self.count >= self.fail_after:
            raise JobCancelled

    def fence(self):
        pass

    def progress(self, completed, total):
        self.check()


@pytest.fixture
def tutor(factory, coordinator):
    with factory() as session:
        course = Course(source='fixture', source_id='coding', name='Synthetic programming')
        session.add(course)
        session.commit()
        identifier = course.id
    service = CodingService(CodingRepository(factory), FixtureRunner(), coordinator)
    task = service.create(identifier, CreatePractice(template='reverse', language='python'))
    return service, task, identifier


@pytest.mark.parametrize('template', list(templates.ENTRIES))
def test_suites_vary_and_detect_concrete_mutants(template):
    first, repeated, second = [templates.cases(template, seed) for seed in ['one', 'one', 'two']]
    assert first == repeated
    assert templates.mutation_check(template, first) == {'kind': 'trusted_oracle_mutations', 'killed': 3, 'total': 3, 'compiled_mutants': False}
    assert all(templates.property_check(template, case.values, case.expected) for case in first)
    if template != 'factorial':
        assert first != second
        assert len(first[-1].values) < len(templates.cases(template, 'one', 'hard')[-1].values)
    assert sum(case.public for case in first) == 2


@pytest.mark.parametrize('filename', ['../Solution.py', 'Main.java', 'main.py', 'Solution.py/evil', 'x;evil.py'])
def test_file_boundary(filename):
    with pytest.raises(ValidationError):
        Files(files={filename: 'test'})


def test_files_and_solution_are_explicit_and_bounded():
    with pytest.raises(ValidationError):
        Files(files={'Solution.py': 'ü' * 65537})
    with pytest.raises(ValidationError):
        Hint(level=4)
    with pytest.raises(ValidationError):
        Review(level=1, feedback='grade injection', passed=10)


def test_draft_conflict_history_and_topic_link(tutor, factory):
    service, task, _ = tutor
    assert task['topic_id']
    files = {'Solution.py': 'def solve(values):\n    return values[::-1]'}
    assert service.draft(task['id'], Draft(files=files, expected_revision=0)) == {'revision': 1}
    with pytest.raises(HTTPException) as error:
        service.draft(task['id'], Draft(files={'Solution.py': 'different'}, expected_revision=0))
    assert error.value.status_code == 409
    assert service.detail(task['id'])['files'] == files
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(CodingDraft)) == 1
        assert session.get(LearningTopic, task['topic_id']).course_id == task['course_id']


def test_real_report_hidden_redaction_and_tutor_cannot_regrade(tutor):
    service, task, _ = tutor
    row = service.repository.reserve_attempt(service.task(task['id']), templates.starter('python'), service.guard)
    service.execute(Context(row.id))
    stored = service.repository.get(CodingAttempt, row.id)
    assert stored.report['solved'] and stored.report['passed'] == stored.report['total']
    assert len(stored.report['code_hash']) == 64
    hidden = [item for item in stored.report['checks'] if not item['public']]
    assert hidden and all(not {'input', 'expected', 'actual', 'console', 'compiler'} & item.keys() for item in hidden)
    with pytest.raises(HTTPException):
        service.feedback_context(row.id)
    service.request_feedback(row.id, 2)
    assert service.feedback_context(row.id)['attempt']['report'] == stored.report
    with pytest.raises(HTTPException):
        service.review(row.id, Review(level=3, feedback='too much help'))
    with pytest.raises(HTTPException):
        service.review(row.id, Review(level=2, feedback='bad line', file='Solution.py', line=999))
    service.review(row.id, Review(level=2, feedback='Explain index direction', file='Solution.py', line=1))
    with pytest.raises(HTTPException):
        service.review(row.id, Review(level=1, feedback='duplicate'))
    assert service.repository.get(CodingAttempt, row.id).report == stored.report
    assert service.progress(task['course_id'])['topics'][0]['without_hints'] == 1


def test_failed_compile_is_not_solved_and_all_cases_fail(tutor):
    service, task, _ = tutor
    service.backend = FixtureRunner(status=6)
    row = service.repository.reserve_attempt(service.task(task['id']), templates.starter('python'), service.guard)
    service.execute(Context(row.id))
    report = service.repository.get(CodingAttempt, row.id).report
    assert report['passed'] == 0 and len(report['checks']) == report['total']
    assert service.backend.calls == 1


def test_cancel_infrastructure_recovery_and_hint_snapshot(tutor):
    service, task, _ = tutor
    stale = service.task(task['id'])
    service.hint(task['id'], Hint(level=2))
    row = service.repository.reserve_attempt(stale, templates.starter('python'), service.guard)
    assert row.hint_level == 2
    with pytest.raises(JobCancelled):
        service.execute(Context(row.id, fail_after=3))
    assert service.repository.get(CodingAttempt, row.id).state == 'cancelled'
    assert not service.repository.get(CodingAttempt, row.id).report
    service.backend = FixtureRunner(status=13)
    second = service.repository.reserve_attempt(service.task(task['id']), templates.starter('python'), service.guard)
    with pytest.raises(RunnerUnavailable):
        service.execute(Context(second.id))
    assert service.repository.get(CodingAttempt, second.id).state == 'interrupted'
    third = service.repository.reserve_attempt(service.task(task['id']), templates.starter('python'), service.guard)
    service.repository.recover(service.guard)
    assert service.repository.get(CodingAttempt, third.id).state == 'interrupted'


def test_ai_task_is_proposal_until_accepted(tutor, factory):
    service, _, course = tutor
    proposal = service.create(course, CreatePractice(template='sort', language='java'), proposed=True)
    assert proposal['status'] == 'proposed' and proposal['topic_id'] is None
    with pytest.raises(HTTPException):
        service.draft(proposal['id'], Draft(files=templates.starter('java'), expected_revision=0))
    service.transition(proposal['id'], 'active')
    with factory() as session:
        assert session.get(CodingTask, proposal['id']).topic_id is not None


def test_judge_payload_isolated_limits_zip_and_no_expected(settings):
    settings.coding_runner_url = 'http://127.0.0.1:2358'
    settings.coding_runner_token = 'synthetic-runner-token'  # pragma: allowlist secret; gitleaks:allow
    settings.coding_runner_isolated = True
    seen = []
    def handle(request):
        assert request.headers['X-Auth-Token'] == settings.coding_runner_token
        if request.url.path == '/config_info':
            return httpx.Response(200, json={'enable_network': False, 'allow_enable_network': False})
        if request.url.path == '/languages':
            return httpx.Response(200, json=[{'id': 1, 'name': 'Python (fixture)'}, {'id': 2, 'name': 'Java (fixture)'}, {'id': 3, 'name': 'JavaScript (Node.js fixture)'}])
        if request.method == 'POST':
            seen.append(json.loads(request.content))
            return httpx.Response(201, json={'token': 'abcdefgh-1234'})  # gitleaks:allow -- invented submission reference
        return httpx.Response(200, json={'status': {'id': 3}, 'stdout': base64.b64encode(b'[2,1]').decode() + '\n', 'time': '0.012', 'memory': 1024})
    runner = Judge0Backend(settings, httpx.MockTransport(handle))
    assert runner.ready()['network'] is False
    result = runner.execute('python', {'Solution.py': 'code', 'Helper.py': 'helper'}, [1, 2], lambda: None)
    assert result.stdout == '[2,1]' and result.runtime_ms == 12
    payload = seen[0]
    assert payload['enable_network'] is False and payload['cpu_time_limit'] == 2 and payload['wall_time_limit'] == 6
    assert not {'expected_output', 'callback_url', 'compiler_options', 'command_line_arguments'} & payload.keys()
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(payload['additional_files']))) as archive:
        assert set(archive.namelist()) == {'Solution.py', 'Helper.py'}


def test_judge_refuses_network_unknown_language_and_unisolated(settings):
    runner = Judge0Backend(settings)
    with pytest.raises(RunnerUnavailable, match='NOT_CONFIGURED'):
        runner.ready()
    settings.coding_runner_url = 'http://127.0.0.1:2358'
    settings.coding_runner_token = 'synthetic-token'  # pragma: allowlist secret; gitleaks:allow
    settings.coding_runner_isolated = True
    runner = Judge0Backend(settings, httpx.MockTransport(lambda request: httpx.Response(200, json={'enable_network': True, 'allow_enable_network': False})))
    with pytest.raises(RunnerUnavailable, match='NETWORK_POLICY'):
        runner.ready()
