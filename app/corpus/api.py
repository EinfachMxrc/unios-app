# SPDX-License-Identifier: AGPL-3.0-or-later
"""HTTP validation/authentication only; retrieval uses a shared service."""

import threading
import time
from collections import OrderedDict, deque
from html import escape

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text

from app.ai.access import allowed
from app.corpus.budget import fit
from app.corpus.contracts import Act, Changes, Context, Fetch, Graph, Outline, Search
from app.corpus.contracts import Request as BudgetRequest
from app.corpus.repository import CorpusRepository
from app.corpus.retrieval_repository import RetrievalRepository
from app.corpus.service import AgentDataPlane
from app.db.models import (
    AssessmentAttempt,
    AssessmentRequest,
    AssessmentTask,
    CodingAttempt,
    CodingTask,
)
from app.entities.actions import ActionRequest
from app.security import is_dashboard_request


class ToolLimits:
    """Bounded sliding window; no query/source contents or credentials retained."""
    def __init__(self):
        self.lock = threading.Lock()
        self.calls: OrderedDict[str, deque] = OrderedDict()

    def check(self, actor):
        now = time.monotonic()
        with self.lock:
            times = self.calls.setdefault(actor, deque())
            self.calls.move_to_end(actor)
            while times and times[0] <= now - 60:
                times.popleft()
            if len(times) >= 60:
                raise HTTPException(429, 'Zu viele Agent-Anfragen', headers={'Retry-After': '60'})
            times.append(now)
            while len(self.calls) > 256:
                self.calls.popitem(last=False)


def agent_router(settings, factory, authorize, audit, actor, scopes, dispatch, cache=None):
    router = APIRouter(prefix='/v2')
    service = AgentDataPlane(factory, settings, cache)
    limits = ToolLimits()

    def run(operation, payload, token):
        with factory() as session:
            authorize(session, token, operation)
            required = {'outline': 'catalog:read', 'changes': 'changes:read', 'act': 'actions:read',
                        'jobs': 'jobs:read'}.get(operation, 'corpus:read')
            if operation == 'search' and payload.mode == 'catalog':
                required = 'catalog:read'
            if operation == 'act' and payload.action_id in {'coding.create_practice', 'coding.next_practice', 'coding.submit_review', 'assessment.create', 'assessment.submit_review'}:
                required = 'coding:propose'
            if actor().startswith('oauth:') and required not in scopes():
                audit(session, operation, None, False)
                raise HTTPException(403, 'OAuth-Berechtigung fehlt: ' + required)
            try:
                limits.check(actor())
                if operation == 'act':
                    result = fit({'result': dispatch(payload.kind, payload.object_id, payload.action_id,
                                       ActionRequest(input=payload.input, dry_run=payload.dry_run), token)}, payload.budget)
                elif operation == 'jobs':
                    pending = []
                    if allowed(session, 'category:coding_tutor'):
                        rows = session.execute(select(CodingAttempt.id, CodingAttempt.task_id, CodingAttempt.course_id,
                                                      CodingAttempt.feedback_level).join(CodingTask).where(
                            CodingAttempt.feedback_requested.is_(True), CodingAttempt.state == 'completed',
                            CodingTask.status == 'active', text("coalesce((SELECT allowed FROM ai_access WHERE key='course:'||coding_attempts.course_id),1)=1")).order_by(CodingAttempt.id).limit(50)).all()
                        pending = [{'attempt': f'coding_attempt:{row.id}', 'task': f'coding_task:{row.task_id}',
                                    'course_id': row.course_id, 'level': row.feedback_level}
                                   for row in rows if allowed(session, f'course:{row.course_id}')]
                    assessment_pending, section_requests = [], []
                    if allowed(session, 'category:coding_tutor'):
                        rows = session.execute(select(AssessmentAttempt.id, AssessmentAttempt.task_id, AssessmentAttempt.course_id)
                            .join(AssessmentTask).where(AssessmentAttempt.feedback_requested.is_(True), AssessmentTask.status == 'active',
                            text("coalesce((SELECT allowed FROM ai_access WHERE key='course:'||assessment_attempts.course_id),1)=1"))
                            .order_by(AssessmentAttempt.id).limit(50)).all()
                        assessment_pending = [{'attempt': f'assessment_attempt:{row.id}', 'task': f'assessment_task:{row.task_id}', 'course_id': row.course_id} for row in rows]
                        rows = session.scalars(select(AssessmentRequest).where(AssessmentRequest.status == 'requested',
                            text("coalesce((SELECT allowed FROM ai_access WHERE key='course:'||assessment_requests.course_id),1)=1"),
                            text("coalesce((SELECT allowed FROM ai_access WHERE key=CASE WHEN json_extract(assessment_requests.source,'$.note_id') IS NOT NULL THEN 'category:notes' ELSE 'category:course_material' END),1)=1"))
                            .order_by(AssessmentRequest.id).limit(50)).all()
                        section_requests = [{'id': row.id, 'course_id': row.course_id, 'source': row.source, 'source_hash': row.source_hash,
                            'plan': ['recall', 'recall', 'understanding', 'understanding', 'transfer', 'exam']}
                            for row in rows if allowed(session, 'category:notes' if row.source.get('note_id') else 'category:course_material')]
                    result = fit({'index': RetrievalRepository(session).index_status(), 'tutor_requests': pending,
                                  'assessment_requests': assessment_pending, 'section_requests': section_requests}, payload.budget)
                else:
                    method = getattr(service, operation)
                    # OAuth scopes form part of cursor identity, preventing cursor reuse
                    # after a narrower grant without retaining access-token secrets.
                    identity = actor() + ':' + ','.join(sorted(scopes()))
                    result = method(payload, identity) if operation in {'search', 'changes', 'context'} else method(payload)
            except HTTPException:
                audit(session, operation, None, False)
                raise
            audit(session, operation, None, True)
            return result

    @router.post('/search')
    def search(payload: Search, x_unios_mcp_token: str = Header(default='')):
        return run('search', payload, x_unios_mcp_token)

    @router.post('/fetch')
    def fetch(payload: Fetch, x_unios_mcp_token: str = Header(default='')):
        return run('fetch', payload, x_unios_mcp_token)

    @router.post('/outline')
    def outline(payload: Outline, x_unios_mcp_token: str = Header(default='')):
        return run('outline', payload, x_unios_mcp_token)

    @router.post('/context')
    def context(payload: Context, x_unios_mcp_token: str = Header(default='')):
        return run('context', payload, x_unios_mcp_token)

    @router.post('/changes')
    def changes(payload: Changes, x_unios_mcp_token: str = Header(default='')):
        return run('changes', payload, x_unios_mcp_token)

    @router.post('/graph')
    def graph(payload: Graph, x_unios_mcp_token: str = Header(default='')):
        return run('graph', payload, x_unios_mcp_token)

    @router.post('/act')
    def act(payload: Act, x_unios_mcp_token: str = Header(default='')):
        return run('act', payload, x_unios_mcp_token)

    @router.post('/jobs')
    def jobs(payload: BudgetRequest, x_unios_mcp_token: str = Header(default='')):
        return run('jobs', payload, x_unios_mcp_token)

    return router


def corpus_status_router(settings, factory):
    router = APIRouter(prefix='/api/corpus', tags=['agent-corpus'])
    repository = CorpusRepository(factory, settings)

    @router.get('/status')
    def status():
        return {'schema': 1, 'algorithm': 'sections-v1', **repository.status()}

    return router


def source_router(settings, factory, cache=None):
    """Private browser citation view; normal device session required on the server."""
    router = APIRouter(prefix='/api/agent-sources')
    service = AgentDataPlane(factory, settings, cache)

    @router.get('/{ref:path}', response_class=HTMLResponse)
    def source(ref: str, request: Request):
        if not is_dashboard_request(request):
            raise HTTPException(403, 'Quelle nur im eigenen UniOS öffnen')
        result = service.fetch(Fetch(refs=[ref], budget=64000))
        def location(entry):
            code = entry.get('location')
            if code:
                return f"{code['file']} · Zeilen {code['start_line']}–{code['end_line']}"
            return f"Seite {entry['page']}" if entry['page'] else 'Gespeicherter Abschnitt'
        blocks = ''.join(f"<article><h2>{escape(entry['heading'] or entry['title'])}</h2>"
                         f"<p>{escape(location(entry))} · Version {escape(entry['version'])}</p>"
                         f"<pre>{escape(entry['text'])}</pre></article>" for entry in result['results'])
        return HTMLResponse("<!doctype html><html lang='de'><meta charset='utf-8'>"
                            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                            "<title>UniOS · Quelle</title><style>body{font:16px system-ui;max-width:52rem;"
                            "margin:3rem auto;padding:1.5rem;line-height:1.6;color:#202027;background:#fafafa}"
                            "pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}article{margin:2rem 0}"
                            "p{color:#585862}@media(prefers-color-scheme:dark){body{background:#191919;color:#eee}"
                            "p{color:#aaa}}</style><h1>Gespeicherte Quelle</h1>" + blocks +
                            ("<p>Auszug begrenzt. Weitere Abschnitte über den Quellenverweis abrufen.</p>"
                             if result['continuations'] else '') + '</html>',
                            headers={'Cache-Control': 'private, no-store',
                                     'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
                                     'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'})

    return router
