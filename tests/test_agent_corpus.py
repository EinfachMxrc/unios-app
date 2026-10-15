# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic retrieval and invalidation, never real files, sessions or accounts."""

import json

import pytest
from fastapi import HTTPException

from app.corpus.contracts import Changes, Fetch, Outline, Search
from app.corpus.repository import CorpusRepository
from app.corpus.service import AgentDataPlane
from app.corpus.worker import CorpusWorker
from app.db.models import (
    AiAccess,
    Course,
    Resource,
    ResourceText,
    ResourceVersion,
    Semester,
)


@pytest.fixture
def corpus(factory, settings, coordinator):
    settings.mcp_token = 'invented-agent-token-' + 'x' * 40
    repository = CorpusRepository(factory, settings)
    worker = CorpusWorker(repository, coordinator)
    with factory() as session:
        semester = Semester(name='WS26')
        session.add(semester)
        session.flush()
        course = Course(source='synthetic', source_id='test', name='Programmieren 1', semester_id=semester.id)
        session.add(course)
        session.flush()
        resource = Resource(source='synthetic', source_key='test', course_id=course.id, kind='pdf',
                            name='Rekursion.pdf', url='https://example.invalid/no-session', group_category='general')
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256='a' * 64,
                                  relative_path='invented.pdf', size=300, mime_type='application/pdf')
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=12,
                                 text='Rekursion Basisfall', markdown='# Rekursion\n## Basisfall\nEine Abbruchbedingung beendet Rekursion.'))
        session.commit()
        ids = course.id, resource.id, version.id
    worker.drain()
    return AgentDataPlane(factory, settings), repository, worker, ids


def test_versioned_retrieval_no_files_and_reindex_stability(corpus, factory, monkeypatch):
    service, repository, worker, (_, resource_id, _) = corpus
    hit = service.search(Search(query='Abbruchbedingung', scope={'semester': 'WS26', 'course': 'Programmieren 1'}))['results'][0]
    original = service.fetch(Fetch(refs=[hit['ref']]))
    assert original['results'][0]['page'] == 12
    assert original['results'][0]['content_hash'] == hit['content_hash']
    assert original['budget']['used'] <= original['budget']['limit']
    outline = service.outline(Outline(ref=hit['document_ref']))
    assert any(entry['title'] == 'Basisfall' for entry in outline['entries'])
    sequence = repository.status()['sequence']
    repository.enqueue_all(lambda: None)
    worker.drain()
    assert repository.status()['sequence'] == sequence
    assert service.search(Search(query='Abbruchbedingung'))['results'][0]['ref'] == hit['ref']
    monkeypatch.setattr('pathlib.Path.read_bytes', lambda *_: pytest.fail('Retrieval opened an original'))
    assert service.fetch(Fetch(refs=[hit['ref']]))['results'][0]['text']
    with factory() as session:
        newer = ResourceVersion(resource_id=resource_id, version=2, sha256='b' * 64,
                                relative_path='never-open.pdf', size=400, mime_type='application/pdf')
        session.add(newer)
        session.flush()
        session.add(ResourceText(version_id=newer.id, page_number=14, text='Neue Abbruchbedingung', markdown=None))
        session.commit()
    assert service.search(Search(query='Abbruchbedingung'))['results'] == []
    worker.drain()
    assert service.search(Search(query='Abbruchbedingung'))['results'][0]['version'] == '2'
    assert service.fetch(Fetch(refs=[hit['ref']]))['results'][0]['stale']


def test_revocation_and_other_groups_apply_before_limit(corpus, factory):
    service, _, _, (course_id, resource_id, _) = corpus
    hit = service.search(Search(query='Rekursion'))['results'][0]
    with factory() as session:
        session.add(AiAccess(key=f'course:{course_id}', allowed=False))
        session.commit()
    assert service.search(Search(query='Rekursion'))['results'] == []
    with pytest.raises(HTTPException) as denied:
        service.fetch(Fetch(refs=[hit['ref']]))
    assert denied.value.status_code == 404
    with factory() as session:
        session.get(AiAccess, f'course:{course_id}').allowed = True
        session.get(Resource, resource_id).group_category = 'other_group'
        session.commit()
    assert service.search(Search(query='Rekursion'))['results'] == []
    with pytest.raises(HTTPException):
        service.outline(Outline(ref=hit['document_ref']))


def test_cursor_is_incremental_tamper_and_permission_bound(corpus, factory):
    service, _, worker, (course_id, _, version_id) = corpus
    first = service.changes(Changes())
    cursor = first['next_cursor']
    assert service.changes(Changes(cursor=cursor))['events'] == []
    with factory() as session:
        session.add(ResourceText(version_id=version_id, page_number=13, text='Rekursionsschritt', markdown=None))
        session.commit()
    worker.drain()
    result = service.changes(Changes(cursor=cursor))
    assert len(result['events']) == 1 and result['events'][0]['event'] == 'resource.updated'
    assert service.changes(Changes(cursor=result['next_cursor']))['events'] == []
    with pytest.raises(HTTPException):
        service.changes(Changes(cursor=cursor[:-2] + 'xx'))
    with factory() as session:
        session.add(AiAccess(key=f'course:{course_id}', allowed=False))
        session.commit()
    with pytest.raises(HTTPException) as reset:
        service.changes(Changes(cursor=cursor))
    assert reset.value.status_code == 409


def test_payload_budget_includes_escaped_unicode_metadata(corpus):
    service, _, _, _ = corpus
    result = service.search(Search(query='Rekursion', budget=2000))
    assert len(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()) <= 2000
    assert result['results'][0]['ranking']['is_probability'] is False


def test_small_budget_fetch_and_outline_never_skip_chunks(corpus, factory):
    service, _, worker, (_, _, version_id) = corpus
    with factory() as session:
        for page in range(20, 35):
            session.add(ResourceText(version_id=version_id, page_number=page,
                                     text=f'Seite {page}', markdown=f'# Abschnitt {page}\n' + 'Beispiel ' * 80))
        session.commit()
    worker.drain()
    doc = service.search(Search(mode='catalog', types=['resource']))['results'][0]['ref']
    expected = service.fetch(Fetch(refs=[doc], budget=64000))['results']
    found, after = [], -1
    while True:
        result = service.fetch(Fetch(refs=[doc], budget=4000, after=after))
        assert len(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()) <= 4000
        found.extend(hit['ref'] for hit in result['results'])
        if not result['continuations']:
            break
        assert result['continuations'][0]['after'] > after
        after = result['continuations'][0]['after']
    assert found == [hit['ref'] for hit in expected]
    indices, after = [], -1
    while True:
        result = service.outline(Outline(ref=doc, budget=3500, after=after))
        indices.extend(entry['index'] for entry in result['entries'])
        if result['next_after'] is None:
            break
        assert result['next_after'] > after
        after = result['next_after']
    assert indices == list(range(len(indices))) and len(indices) >= 15
    parent = service.fetch(Fetch(refs=[doc], sections=['Rekursion']))
    assert any(hit['heading'] == 'Basisfall' for hit in parent['results'])


def test_pdf_native_outline_and_background_failure_isolation(corpus, factory, settings, monkeypatch):
    import pymupdf
    service, repository, worker, (_, resource_id, version_id) = corpus
    target = settings.data_dir / 'uni' / 'synthetic.pdf'
    target.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as pdf:
        for _ in range(14):
            pdf.new_page()
        pdf.set_toc([[1, 'Rekursion', 12], [2, 'Basisfall', 12], [2, 'Rekursionsschritt', 13]])
        pdf.save(target)
    with factory() as session:
        session.get(ResourceVersion, version_id).relative_path = 'uni/synthetic.pdf'
        session.add(ResourceText(version_id=version_id, page_number=13, text='Rekursionsschritt', markdown=None))
        session.commit()
    worker.drain()
    outline = service.outline(Outline(ref=f'resource:{resource_id}'))
    assert outline['entries'][0]['origin'] == 'pdf_bookmark'
    assert outline['entries'][0]['end_page'] == 13
    import app.corpus.repository as module
    original = module.sources
    def broken(session, config, ref, guard):
        if ref.startswith('course:'):
            raise ValueError('Invented sensitive parser detail')
        return original(session, config, ref, guard)
    monkeypatch.setattr(module, 'sources', broken)
    repository.enqueue_all(lambda: None)
    worker.drain()
    assert repository.status()['failed'] == 1
    assert service.search(Search(query='Basisfall'))['results']
    assert worker.drain() == 0  # failure must not starve or spin
    monkeypatch.setattr(module, 'sources', original)
    repository.enqueue_all(lambda: None)
    worker.drain()
    assert repository.status()['failed'] == 0


def test_mcp_v2_contract_scopes_rate_limit_and_private_citations(corpus, settings, coordinator):
    from hashlib import sha256
    from hmac import new
    from urllib.parse import urlsplit

    from fastapi.testclient import TestClient

    from app.main import create_app
    service, _, _, (_, resource_id, _) = corpus
    settings.mcp_enabled = True
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        path = '/api/ai/mcp/v2/search'
        assert client.post(path, json={'query': 'Rekursion'}).status_code == 403
        headers = {'X-UniOS-MCP-Token': settings.mcp_token}
        assert client.post(path, json={'budget': 64001}, headers=headers).status_code == 422
        hit = client.post(path, json={'query': 'Rekursion'}, headers=headers).json()['results'][0]
        assert client.get(urlsplit(hit['url']).path).status_code == 200
        scopes = 'mcp catalog:read'
        actor = 'synthetic-reader'
        signature = new(settings.mcp_token.encode(), f'mcp-client:{actor}:scopes:{scopes}'.encode(), sha256).hexdigest()
        headers.update({'X-UniOS-MCP-Client': actor, 'X-UniOS-MCP-Scopes': scopes,
                        'X-UniOS-MCP-Client-Signature': signature})
        assert client.post(path, json={'query': 'Rekursion'}, headers=headers).status_code == 403
        assert client.post(path, json={'mode': 'catalog'}, headers=headers).status_code == 200
        headers['X-UniOS-MCP-Scopes'] = 'mcp corpus:read'
        assert client.post(path, json={}, headers=headers).status_code == 403
        scopes = 'mcp corpus:read jobs:read actions:read'
        headers['X-UniOS-MCP-Scopes'] = scopes
        headers['X-UniOS-MCP-Client-Signature'] = new(settings.mcp_token.encode(),
            f'mcp-client:{actor}:scopes:{scopes}'.encode(), sha256).hexdigest()
        assert client.post('/api/ai/mcp/v2/jobs', json={}, headers=headers).status_code == 200
        before = len(client.get('/api/ai/mcp/audit').json())
        assert client.post('/api/ai/mcp/v2/act', json={'kind': 'resource', 'object_id': str(resource_id),
                          'action_id': 'resource.reextract'}, headers=headers).status_code in {403, 404}
        records = client.get('/api/ai/mcp/audit').json()
        assert len(records) == before + 1
        assert records[0]['tool'] == 'act' and records[0]['permitted'] is False
        for _ in range(61):
            response = client.post(path, json={'query': 'Rekursion'}, headers=headers)
        assert response.status_code == 429 and response.headers['retry-after'] == '60'
    assert service.search(Search(query='Rekursion'))['results']


def test_new_mcp_has_eight_tools_and_one_compact_content():
    import asyncio

    from mcp import Client
    from mcp.server import MCPServer

    from app.corpus.budget import encoded
    from clients.uni_mcp.agent_tools import register
    server = MCPServer('synthetic')
    register(server, lambda *args, **kwargs: {'results': [{'title': 'Übung'}], 'budget': {'used': 60}})
    async def inspect():
        async with Client(server) as client:
            names = {tool.name for tool in (await client.list_tools()).tools}
            result = await client.call_tool('search', {'query': 'Rekursion'})
            assert len(result.content) == 1
            assert result.structured_content is None
            assert result.content[0].text == encoded({'results': [{'title': 'Übung'}], 'budget': {'used': 60}}).decode()
            return names
    assert asyncio.run(inspect()) == {'search', 'fetch', 'outline', 'context', 'graph', 'changes', 'act', 'jobs'}


def test_saved_code_symbols_opt_in_and_old_commit_resolution(corpus, factory, monkeypatch):
    from datetime import UTC, datetime
    from io import BytesIO
    from zipfile import ZipFile

    from app.db.models import Project, RepoSnapshot
    service, _, worker, (course_id, _, _) = corpus
    bundle = BytesIO()
    with ZipFile(bundle, 'w') as archive:
        archive.writestr('projekt/main.py', 'class HostCoordinator:\n    def resume(self):\n        return helper()\n\ndef helper():\n    return 42\n')
        archive.writestr('projekt/.env', 'INVENTED_PASSWORD=do-not-index')
        archive.writestr('projekt/ui.ts', 'function fakeSymbol() { return 1 }')
    monkeypatch.setattr('app.corpus.code_index.archive_snapshot', lambda *_: bundle.getvalue())
    with factory() as session:
        project = Project(name='Testprojekt', course_id=course_id)
        session.add(project)
        session.flush()
        snapshot = RepoSnapshot(project_id=project.id, repository='fixture/repo', fetched_at=datetime.now(UTC),
                                manifest_path='fake.json', manifest_sha256='c' * 64, refs_count=1, head='d' * 40)
        session.add(snapshot)
        session.commit()
    worker.drain()
    assert not service.search(Search(query='HostCoordinator', mode='symbol'))['results']
    with factory() as session:
        session.add_all([AiAccess(key='category:projects', allowed=True), AiAccess(key='category:project_code', allowed=True)])
        session.commit()
    hit = service.search(Search(query='HostCoordinator', mode='symbol'))['results'][0]
    assert hit['page'] is None and hit['location']['start_line'] == 1
    assert hit['location']['file'] == 'main.py' and hit['location']['symbol_kind'] == 'ClassDef'
    assert 'helper' in hit['location']['references']
    method = service.search(Search(query='HostCoordinator.resume', mode='symbol'))['results'][0]
    assert method['location']['qualified_name'] == 'HostCoordinator.resume'
    assert method['location']['calls'] == ['helper']
    helper = service.search(Search(query='helper', mode='symbol'))['results'][0]
    assert any(c['symbol'] == 'HostCoordinator.resume' for c in helper['location']['caller_candidates'])
    assert 'class HostCoordinator' in service.fetch(Fetch(refs=[hit['ref']]))['results'][0]['text']
    assert service.search(Search(query='do-not-index', types=['code']))['results'] == []
    assert service.search(Search(query='fakeSymbol', mode='symbol'))['results'] == []
    with factory() as session:
        session.add(RepoSnapshot(project_id=project.id, repository='fixture/repo',
                                fetched_at=datetime.now(UTC), manifest_path='fake-new.json',
                                manifest_sha256='e' * 64, refs_count=1, head='f' * 40))
        session.commit()
    worker.drain()
    current = service.search(Search(query='HostCoordinator', mode='symbol'))['results'][0]
    assert current['document_ref'] != hit['document_ref']
    assert service.outline(Outline(ref=hit['document_ref']))['summary']['stale'] is True


def test_open_question_pack_excludes_resolved_and_highlights(corpus, factory):
    from app.corpus.contracts import Context
    from app.db.models import MaterialAnnotation
    service, _, worker, (_, resource_id, version_id) = corpus
    with factory() as session:
        for name, kind, resolved in [('open', 'question', False), ('done', 'question', True),
                                     ('highlight', 'highlight', False)]:
            session.add(MaterialAnnotation(id=name, resource_id=resource_id, source_version_id=version_id,
                                          kind=kind, resolved=resolved, source_page=12, quote='Rekursion'))
        session.commit()
    worker.drain()
    pack = service.context(Context(query='Rekursion', types=['question']))
    assert {c['entity_ref'] for c in pack['sources']} == {'question:open', 'question:done'}
    assert len(pack['open_questions']) == 1
    assert next(c for c in pack['sources'] if c['ref'] == pack['open_questions'][0])['entity_ref'] == 'question:open'


def test_cancelled_publication_keeps_previous_index_and_queue(corpus, factory):
    from sqlalchemy import text
    service, repository, worker, (_, _, version_id) = corpus
    ref = service.search(Search(query='Rekursion'))['results'][0]['document_ref']
    with factory() as session:
        session.execute(text('UPDATE resource_texts SET text=:body,markdown=:body WHERE version_id=:id'),
                        {'body': 'changed Rekursion', 'id': version_id})
        session.commit()
    class Cancelled(Exception):
        pass
    calls = 0
    def cancel():
        nonlocal calls
        calls += 1
        if calls >= 3:
            raise Cancelled()
    with pytest.raises(Cancelled):
        worker.drain(check=cancel)
    assert repository.status()['pending'] > 0
    assert service.fetch(Fetch(refs=[ref]))['results']
    worker.drain()
    assert repository.status()['pending'] == 0


def test_derived_schema_rollback_and_restore_epoch(corpus, factory, tmp_path):
    import sqlite3
    from hashlib import sha256

    from sqlalchemy import text

    from app.corpus.schema_v1 import install, uninstall
    from app.host.handoff import _stage_snapshot
    from app.host.snapshots import SnapshotManifest
    service, _, worker, (_, resource_id, _) = corpus
    ref = service.search(Search(query='Rekursion'))['results'][0]['ref']
    with factory() as session:
        original_epoch = session.scalar(text("SELECT value FROM corpus_state WHERE key='epoch'"))
        connection = session.connection()
        uninstall(connection)
        assert session.get(Resource, resource_id).name == 'Rekursion.pdf'
        install(connection)
        session.commit()
    worker.drain()
    assert service.search(Search(query='Rekursion'))['results'][0]['ref'] == ref
    folder = tmp_path / 'fake-snapshots'
    folder.mkdir()
    snapshot = folder / 'source.sqlite3'
    with sqlite3.connect(snapshot) as connection:
        for table in ['courses', 'resources', 'resource_versions']:
            connection.execute(f'CREATE TABLE {table}(id INTEGER PRIMARY KEY)')
        connection.execute('CREATE TABLE corpus_state(key TEXT PRIMARY KEY,value TEXT)')
        connection.execute('INSERT INTO corpus_state VALUES(?,?)', ('epoch', original_epoch))
    source_hash = sha256(snapshot.read_bytes()).hexdigest()
    manifest = SnapshotManifest(snapshot.name, 1, '2026-01-01T00:00:00Z', source_hash, 'synthetic-device')
    staged = _stage_snapshot(folder, manifest, tmp_path / 'target.sqlite3')
    assert sha256(snapshot.read_bytes()).hexdigest() == source_hash
    with sqlite3.connect(staged) as connection:
        assert connection.execute('SELECT value FROM corpus_state').fetchone()[0] != original_epoch


def test_cli_uses_same_bounded_contract_without_opening_sources(monkeypatch, tmp_path):
    from typer.testing import CliRunner

    from app.cli.agent import agent_cli
    calls = []
    def fake(operation, payload, port):
        calls.append((operation, payload, port))
        return {'results': []}
    monkeypatch.setattr('app.cli.agent.retrieve', fake)
    runner = CliRunner()
    result = runner.invoke(agent_cli, ['search', 'Rekursion', '--course', 'Programmieren 1', '--budget', '8000'])
    assert result.exit_code == 0, result.output
    assert calls[0][0] == 'search' and calls[0][1]['query'] == 'Rekursion'
    assert calls[0][1]['budget'] == 8000
    request = tmp_path / 'request.json'
    request.write_text(json.dumps({'refs': ['resource:1'], 'budget': 5000}), encoding='utf-8')
    assert runner.invoke(agent_cli, ['fetch', str(request)]).exit_code == 0
    assert calls[-1][0] == 'fetch' and calls[-1][1]['refs'] == ['resource:1']


def test_structured_query_context_and_source_policy(corpus, factory):
    from app.corpus.contracts import Context
    from app.db.models import Jot
    service, _, worker, (course_id, resource_id, _) = corpus
    assert service.search(Search(query='Rekursion course:"Programmieren 1" semester:WS26 type:material'))['results']
    with factory() as session:
        session.add(Jot(id='synthetic-jot', body='Rekursion braucht einen Basisfall',
                        kind='text', course_id=course_id))
        session.add(AiAccess(key='category:notes', allowed=True))
        session.commit()
    worker.drain()
    pack = service.context(Context(query='Rekursion', types=['resource', 'jot'], budget=5000))
    assert len(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode()) <= 5000
    assert set(pack['source_handles']) == {hit['ref'] for hit in pack['sources']}
    assert {'resource', 'jot'} == {hit['type'] for hit in pack['sources']}
    with factory() as session:
        session.get(Resource, resource_id).group_category = 'other_group'
        session.commit()
    worker.drain()
    denied = service.search(Search(mode='catalog', types=['resource']))
    assert denied['results'] == []


def test_search_cache_rechecks_live_rights_and_invalidation(corpus, factory, monkeypatch):
    from app.corpus.retrieval_repository import RetrievalRepository
    service, _, worker, (course_id, resource_id, version_id) = corpus
    calls = []
    original = RetrievalRepository.search
    def counted(self, request, offset=0):
        calls.append(request.query)
        return original(self, request, offset)
    monkeypatch.setattr(RetrievalRepository, 'search', counted)
    request = Search(query='Rekursion', types=['resource'], budget=64000)
    first = service.search(request)
    second = service.search(request)
    assert first == second and len(calls) == 1
    assert first['corpus_revision'].endswith(':' + str(first['index_sequence']))
    first['results'][0]['title'] = 'mutated response'
    assert service.search(request)['results'][0]['title'] == 'Rekursion.pdf'
    # An actor/grant is a distinct cache namespace, even for the same query.
    service.search(request, actor='oauth:another:corpus:read')
    assert len(calls) == 2
    with factory() as session:
        session.add(AiAccess(key=f'course:{course_id}', allowed=False))
        session.commit()
    assert service.search(request)['results'] == []
    with factory() as session:
        session.get(AiAccess, f'course:{course_id}').allowed = True
        session.get(Resource, resource_id).group_category = 'other_group'
        session.commit()
    assert service.search(request)['results'] == []
    with factory() as session:
        session.get(Resource, resource_id).group_category = 'general'
        session.add(ResourceText(version_id=version_id, page_number=13, text='Rekursion neu', markdown=None))
        session.commit()
    assert service.search(request)['results'] == []  # worker has not published yet
    worker.drain()
    assert service.search(request)['index_sequence'] > second['index_sequence']


def test_exact_duplicates_group_before_limit_and_remain_fetchable(corpus, factory):
    service, _, worker, (course_id, resource_id, version_id) = corpus
    with factory() as session:
        source = session.get(ResourceText, session.query(ResourceText.id).filter_by(version_id=version_id).scalar())
        clone = Resource(source='synthetic', source_key='duplicate', course_id=course_id,
                         kind='pdf', name='Copy.pdf', url='https://example.invalid/copy', group_category='general')
        session.add(clone)
        session.flush()
        version = ResourceVersion(resource_id=clone.id, version=1, sha256='c' * 64,
                                  relative_path='not-created.pdf', size=300, mime_type='application/pdf')
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=12, text=source.text, markdown=source.markdown))
        clone_id = clone.id
        session.commit()
    worker.drain()
    request = Search(query='Abbruchbedingung', types=['resource'], top_k=1, budget=64000)
    grouped = service.search(request)
    assert len(grouped['results']) == 1 and grouped['next_cursor'] is None
    all_hits = service.search(request.model_copy(update={'deduplicate': False, 'top_k': 20}))['results']
    assert {hit['entity_ref'] for hit in all_hits} == {f'resource:{resource_id}', f'resource:{clone_id}'}
    assert len(service.fetch(Fetch(refs=[hit['ref'] for hit in all_hits]))['results']) == 2
    with factory() as session:
        session.get(Resource, resource_id).group_category = 'other_group'
        session.commit()
    # Removing the representative must not hide the remaining permitted duplicate.
    assert service.search(request)['results'][0]['entity_ref'] == f'resource:{clone_id}'


def test_temporal_views_are_explicit_and_explainable(corpus, factory):
    from datetime import UTC, datetime

    from app.corpus.contracts import Context
    service, _, worker, (course_id, _, _) = corpus
    assert service.search(Search(mode='catalog', view='current_semester'))['results'] == []
    with factory() as session:
        semester = session.get(Semester, session.get(Course, course_id).semester_id)
        semester.is_current, semester.starts_at = True, datetime(2026, 10, 1, tzinfo=UTC)
        for year in [2023, 2024, 2025]:
            earlier = Semester(name=f'WS{year}', starts_at=datetime(year, 10, 1, tzinfo=UTC))
            session.add(earlier)
            session.flush()
            session.add(Course(source='synthetic', source_id=str(year), name=f'Kurs {year}', semester_id=earlier.id))
        session.commit()
    worker.drain()
    hits = service.search(Search(mode='catalog', types=['course']))['results']
    assert {hit['title']: hit['tier'] for hit in hits} == {
        'Programmieren 1': 'hot', 'Kurs 2023': 'cold', 'Kurs 2024': 'warm', 'Kurs 2025': 'warm'}
    current = service.search(Search(query='Rekursion', types=['resource'], scope={'course': course_id}, view='current_semester'))
    assert {'lexical_match', 'course_filter', 'type_filter', 'view:current_semester'} <= set(current['results'][0]['reasons'])
    assert 'title_match' in current['results'][0]['reasons']
    pack = service.context(Context(goal='overview', view='current_semester', budget=64000))
    assert len(pack['semesters']) == 1 and pack['semesters'][0]['semester'] == 'WS26'
    assert pack['semesters'][0]['derived'] and not pack['includes_full_originals']
    # Historical scope remains available, regardless of hot/cold labels.
    assert service.search(Search(mode='catalog', scope={'semester': 'WS2023'}))['results'][0]['tier'] == 'cold'


def test_unread_and_workflow_views_change_without_index_publication(corpus, factory):
    from datetime import UTC, datetime

    from app.db.models import Assignment, ObjectMetadata
    service, _, worker, (course_id, _, version_id) = corpus
    request = Search(mode='catalog', view='unread_material', types=['resource'])
    assert service.search(request)['results']
    with factory() as session:
        session.get(ResourceVersion, version_id).first_opened_at = datetime.now(UTC)
        work = Assignment(source='synthetic', source_key='work', course_id=course_id, title='Offene Abgabe')
        session.add(work)
        session.flush()
        work_id = work.id
        session.add(ObjectMetadata(object_type='assignment', object_id=str(work_id), workflow_status='open'))
        session.add(AiAccess(key='category:deadlines', allowed=True))
        session.commit()
    worker.drain()
    assert service.search(request)['results'] == []
    open_work = Search(mode='catalog', view='open_work')
    assert service.search(open_work)['results'][0]['entity_ref'] == f'assignment:{work_id}'
    with factory() as session:
        metadata = session.query(ObjectMetadata).filter_by(object_type='assignment', object_id=str(work_id)).one()
        metadata.workflow_status, metadata.revision = 'done', metadata.revision + 1
        session.commit()
    assert service.search(open_work)['results'] == []


def test_context_rejects_mid_selection_revocation(corpus, factory, monkeypatch):
    from app.corpus.contracts import Context
    service, _, _, (course_id, _, _) = corpus
    original = service.search
    def revoke(request, actor='local'):
        result = original(request, actor)
        with factory() as session:
            if session.get(AiAccess, f'course:{course_id}') is None:
                session.add(AiAccess(key=f'course:{course_id}', allowed=False))
                session.commit()
        return result
    monkeypatch.setattr(service, 'search', revoke)
    with pytest.raises(HTTPException) as error:
        service.context(Context(query='Rekursion'))
    assert error.value.status_code == 409


def test_catalog_is_metadata_only_and_mail_requires_its_own_grant(corpus, factory):
    from app.db.models import MailItem
    service, _, worker, _ = corpus
    with factory() as session:
        mail = MailItem(source_hash='f' * 64, sender='fixture@example.invalid', subject='Erfundene Frist')
        session.add(mail)
        session.commit()
    worker.drain()
    assert not service.search(Search(mode='catalog', types=['mail']))['results']
    with factory() as session:
        session.add(AiAccess(key='category:mail', allowed=True))
        session.commit()
    hit = service.search(Search(mode='catalog', types=['mail']))['results'][0]
    assert hit['mail']['sender'] == 'fixture@example.invalid'
    assert hit['mail']['subject'] == 'Erfundene Frist'
    assert 'excerpt' not in hit and 'text' not in hit and 'body' not in hit['mail']
    material = service.search(Search(mode='catalog', types=['resource']))['results'][0]
    assert material['catalog']['indexed_pages'] == 1
    assert material['catalog']['last_indexed_page'] == 12
    assert material['catalog']['outline_available']


def test_context_weak_topics_use_only_released_evidence(corpus, factory, settings):
    from app.corpus.contracts import Context
    from app.db.models import (
        AnkiCard,
        AnkiCardQueue,
        AnkiReview,
        Exercise,
        ExerciseAttempt,
        LearningTopic,
        utc_now,
    )
    service, _, worker, (course_id, resource_id, _) = corpus
    with factory() as session:
        topic = LearningTopic(course_id=course_id, slug='fixture-topic', name='Erfundene Rekursion')
        session.add(topic)
        session.flush()
        topic_id = topic.id
        exercise = Exercise(topic_id=topic.id, question='Erfundene Frage?', solution='Erfundene Antwort')
        card = AnkiCardQueue(resource_id=resource_id, topic_id=topic_id, status='approved', payload='Erfundene Karte')
        session.add_all([exercise, card])
        session.flush()
        review_card = AnkiCard(queue_id=card.id, note_id='fixture-review')
        session.add(review_card)
        session.flush()
        session.add_all([ExerciseAttempt(exercise_id=exercise.id, answer='Erfundene Antwort', correct=False)
                         for _ in range(settings.learning_min_attempts)])
        session.add_all([AnkiReview(card_id=review_card.id, rating=1, reviewed_at=utc_now())
                         for _ in range(settings.learning_min_reviews)])
        session.commit()
    worker.drain()
    assert service.context(Context(scope={'course': course_id}, budget=64000))['weak_topics'] == []
    with factory() as session:
        session.add_all([AiAccess(key='category:learning_state', allowed=True), AiAccess(key='category:exercises', allowed=True)])
        session.commit()
    pack = service.context(Context(scope={'course': course_id}, budget=64000))
    weak = next(item for item in pack['weak_topics'] if item['ref'].startswith(f'topic:{topic_id}@'))
    assert weak['accuracy'] == 0 and weak['retention'] == 0 and weak['confidence'] == 'high'
    assert weak['reason'] == 'below_threshold' and weak['derived']
    with factory() as session:
        session.get(Resource, resource_id).group_category = 'other_group'
        session.commit()
    worker.drain()
    # Topic remains allowed, but reviews tied to excluded source cards must disappear.
    weak = service.context(Context(scope={'course': course_id}, budget=64000))['weak_topics'][0]
    assert weak['retention'] is None and weak['reviews'] == 0


def test_search_cursor_restarts_when_pending_visibility_changes(corpus, factory):
    service, _, worker, (_, _, version_id) = corpus
    with factory() as session:
        session.add(ResourceText(version_id=version_id, page_number=13, text='Rekursion zusätzlicher Abschnitt', markdown=None))
        session.commit()
    worker.drain()
    request = Search(query='Rekursion', top_k=1, budget=64000)
    first = service.search(request)
    assert first['next_cursor']
    with factory() as session:
        session.add(ResourceText(version_id=version_id, page_number=14, text='Rekursion geändert', markdown=None))
        session.commit()
    with pytest.raises(HTTPException) as error:
        service.search(request.model_copy(update={'cursor': first['next_cursor']}))
    assert error.value.status_code == 409


def test_catalog_keeps_distinct_sources_without_extracted_text(corpus, factory):
    service, _, worker, (course_id, _, _) = corpus
    ids = []
    with factory() as session:
        for index in range(2):
            resource = Resource(source='synthetic', source_key=f'not-extracted-{index}', course_id=course_id,
                                kind='pdf', name='Unbekannter Inhalt', url='https://example.invalid/unknown')
            session.add(resource)
            session.flush()
            ids.append(resource.id)
            session.add(ResourceVersion(resource_id=resource.id, version=1, sha256=str(index) * 64,
                        relative_path='not-created.pdf', size=200, mime_type='application/pdf'))
        session.commit()
    worker.drain()
    hits = service.search(Search(mode='catalog', types=['resource'], budget=64000))['results']
    unknown = [hit for hit in hits if hit['entity_ref'] in {f'resource:{identifier}' for identifier in ids}]
    assert len(unknown) == 2
    assert [(hit['duplicate_count'], hit['catalog']['indexed_pages']) for hit in unknown] == [(1, 0), (1, 0)]
    implicit = service.search(Search(query='', types=['resource'], budget=64000))['results']
    assert all('catalog' in hit['reasons'] and 'ranking' not in hit for hit in implicit)


def test_large_document_cannot_crowd_out_other_sources_or_break_pagination(corpus, factory):
    from collections import Counter
    service, _, worker, (course_id, resource_id, version_id) = corpus
    with factory() as session:
        for page in range(20, 50):
            session.add(ResourceText(version_id=version_id, page_number=page, text='Rekursion in einem langen Skript', markdown=None))
        other = Resource(source='synthetic', source_key='another-source', course_id=course_id,
                         kind='pdf', name='Anderes Rekursionsskript', url='https://example.invalid/second')
        session.add(other)
        session.flush()
        other_id = other.id
        version = ResourceVersion(resource_id=other.id, version=1, sha256='b' * 64,
                                  relative_path='not-created.pdf', size=200, mime_type='application/pdf')
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=1, text='Rekursion aus einer zweiten Quelle', markdown=None))
        session.commit()
    worker.drain()
    hits = service.search(Search(query='Rekursion', types=['resource'], budget=64000))['results']
    assert {hit['entity_ref'] for hit in hits} == {f'resource:{resource_id}', f'resource:{other_id}'}
    assert max(Counter(hit['document_ref'] for hit in hits).values()) <= 2
    seen, cursor = [], None
    while True:
        payload = service.search(Search(query='Rekursion', types=['resource'], budget=64000, top_k=1, cursor=cursor))
        seen.extend(hit['ref'] for hit in payload['results'])
        cursor = payload['next_cursor']
        if cursor is None:
            break
    assert seen == [hit['ref'] for hit in hits]
    assert len(seen) == len(set(seen))
