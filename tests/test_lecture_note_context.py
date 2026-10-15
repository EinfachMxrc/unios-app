# SPDX-License-Identifier: AGPL-3.0-or-later
"""Lecture context remains readable and points at exact, released synthetic pages."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.models import AiAccess, Course, Resource, ResourceText, ResourceVersion
from app.main import create_app

FETCH = '/api/ai/mcp/v2/fetch'


@pytest.fixture
def lecture_source(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = 'synthetic-lecture-token-' + 'x' * 40
    with factory() as session:
        session.execute(text('CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED,title,body)'))
        course = Course(source='synthetic', source_id='lecture-context', name='Synthetic lecture')
        session.add(course)
        session.flush()
        resources = [Resource(source='synthetic', source_key=key, course_id=course.id, kind='pdf',
                              name=name, url='https://example.invalid/fictional', group_category='general')
                     for key, name in [('unrelated', 'Unrelated.pdf'), ('lecture', 'Synthetic script.pdf')]]
        session.add_all(resources)
        session.flush()
        versions = [ResourceVersion(resource_id=resource.id, version=1, sha256=digit * 64,
                                    relative_path='never-open-' + digit + '.pdf', size=100,
                                    mime_type='application/pdf')
                    for resource, digit in zip(resources, ['a', 'b'], strict=True)]
        session.add_all(versions)
        session.flush()
        version = versions[1]
        # Version IDs and version numbers deliberately differ.
        assert version.id != version.version
        for page in range(1, 5):
            session.add(ResourceText(version_id=version.id, page_number=page,
                                     text=f'Original lecture page {page}', markdown=None))
        session.commit()
        ids = course.id, resources[1].id, version.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        app.state.corpus_worker.drain()
        yield client, factory, app.state.corpus_worker, ids, {'X-UniOS-MCP-Token': settings.mcp_token}


def add_version(factory, resource_id, number, *, large=False):
    with factory() as session:
        version = ResourceVersion(resource_id=resource_id, version=number, sha256=str(number) * 64,
                                  relative_path=f'never-open-v{number}.pdf', size=100,
                                  mime_type='application/pdf')
        session.add(version)
        session.flush()
        for page in range(1, 5):
            body = (f'Updated lecture v{number} page {page} ' * 700) if large else f'Updated lecture v{number} page {page}'
            session.add(ResourceText(version_id=version.id, page_number=page, text=body, markdown=None))
        session.commit()
        return version.id


def test_context_only_revision_of_originally_empty_note_is_fetchable(lecture_source):
    client, factory, worker, (course_id, resource_id, version_id), headers = lecture_source
    created = client.post('/api/notes', json={'course_id': course_id, 'resource_id': resource_id,
                                             'title': 'Synthetic lecture 2026-10-14', 'body': ''})
    assert created.status_code == 201, created.text
    note_id = created.json()['note']['id']
    context = (f'> [!note] Vorlesung am 2026-10-14\n'
               f'> Quelle: [Synthetic script.pdf · Version 1](/material/{version_id})\n'
               f'> Bearbeitete PDF-Seiten: [S. 2](/material/{version_id}?page=2), '
               f'[S. 4](/material/{version_id}?page=4)')
    saved = client.put(f'/api/notes/{note_id}', json={'expected_revision': 1,
        'title': 'Synthetic lecture 2026-10-14', 'body': context})
    assert saved.status_code == 200, saved.text
    worker.drain()
    # New context does not implicitly release the user's notes to GPT.
    assert client.post(FETCH, json={'refs': [f'note:{note_id}']}, headers=headers).status_code == 404
    with factory() as session:
        session.add(AiAccess(key='category:notes', allowed=True))
        session.commit()
    result = client.post(FETCH, json={'refs': [f'note:{note_id}']}, headers=headers)
    assert result.status_code == 200, result.text
    fetched = '\n'.join(entry['text'] for entry in result.json()['results'])
    assert context == fetched
    assert {entry['version'] for entry in result.json()['results']} == {'2'}
    search = client.post('/api/ai/mcp/v2/search', headers=headers,
                         json={'query': 'Vorlesung', 'types': ['note'], 'scope': {'course': course_id}})
    assert search.status_code == 200, search.text
    assert search.json()['results'][0]['entity_ref'] == f'note:{note_id}'
    assert client.get(f'/api/notes/{note_id}', params={'revision': 1}).json()['body'] == ''
    pages = client.post(FETCH, headers=headers,
                        json={'refs': [f'/material/{version_id}?page=2', f'/material/{version_id}?page=4']})
    assert pages.status_code == 200, pages.text
    assert [(entry['page'], entry['text']) for entry in pages.json()['results']] == [
        (2, 'Original lecture page 2'), (4, 'Original lecture page 4')]


def test_reader_links_fetch_historical_pages_after_pdf_update(lecture_source, monkeypatch):
    client, factory, worker, (_, resource_id, old_id), headers = lecture_source
    first = client.post(FETCH, headers=headers, json={'refs': [f'/material/{old_id}?page=2']}).json()
    exact_ref = first['results'][0]['document_ref']
    new_id = add_version(factory, resource_id, 2)
    # Publication of a newer version must not be confused with the saved old ID.
    assert client.post(FETCH, headers=headers, json={'refs': [f'/material/{new_id}?page=2']}).status_code == 404
    worker.drain()
    monkeypatch.setattr('pathlib.Path.read_bytes', lambda *_: pytest.fail('Retrieval opened an original PDF'))
    old = client.post(FETCH, headers=headers, json={'refs': [f'/material/{old_id}'], 'pages': [2, 4]})
    assert old.status_code == 200, old.text
    assert [(entry['page'], entry['text']) for entry in old.json()['results']] == [
        (2, 'Original lecture page 2'), (4, 'Original lecture page 4')]
    assert all(entry['stale'] and entry['version'] == '1' and entry['document_ref'] == exact_ref
               and entry['source_hash'] == 'b' * 64 for entry in old.json()['results'])
    current = client.post(FETCH, headers=headers, json={'refs': [f'resource:{resource_id}'], 'pages': [2]})
    assert current.json()['results'][0]['text'] == 'Updated lecture v2 page 2'
    missing = client.post(FETCH, headers=headers, json={'refs': [f'/material/{old_id}?page=99']})
    assert missing.status_code == 200 and missing.json()['results'] == []


def test_reader_link_continuation_retains_immutable_version_and_page(lecture_source):
    client, factory, worker, (_, resource_id, _), headers = lecture_source
    large_id = add_version(factory, resource_id, 2, large=True)
    worker.drain()
    request = {'refs': [f'/material/{large_id}?page=2'], 'budget': 4000}
    first = client.post(FETCH, headers=headers, json=request)
    assert first.status_code == 200, first.text
    continuation = first.json()['continuations'][0]
    assert continuation['ref'].startswith(f'resource:{resource_id}@v2:')
    assert continuation['pages'] == [2]
    add_version(factory, resource_id, 3)
    worker.drain()
    response = client.post(FETCH, headers=headers, json={'refs': [continuation['ref']],
        'after': continuation['after'], 'pages': continuation['pages'], 'budget': 64000})
    assert response.status_code == 200, response.text
    results = first.json()['results'] + response.json()['results']
    assert len(results) > 1 and {entry['page'] for entry in results} == {2}
    assert {entry['version'] for entry in results} == {'2'}
    assert 'Updated lecture v3' not in ''.join(entry['text'] for entry in results)
    assert response.json()['continuations'] == []


def test_reader_link_minimum_budget_returns_validation_error_when_no_chunk_fits(lecture_source):
    client, factory, worker, (_, resource_id, _), headers = lecture_source
    large_id = add_version(factory, resource_id, 2, large=True)
    worker.drain()
    response = client.post(FETCH, headers=headers,
                           json={'refs': [f'/material/{large_id}?page=2'], 'budget': 512})
    assert response.status_code == 422, response.text
    assert response.json()['detail'] == 'Budget zu klein für einen Abschnitt und Fortsetzungsverweise'


def test_mixed_page_alias_and_full_source_continuation_does_not_skip_early_chunks(lecture_source):
    client, factory, worker, (_, resource_id, _), headers = lecture_source
    large_id = add_version(factory, resource_id, 2, large=True)
    worker.drain()
    first = client.post(FETCH, headers=headers,
                        json={'refs': [f'/material/{large_id}?page=4', f'/material/{large_id}'], 'budget': 4000})
    assert first.status_code == 200, first.text
    initial = first.json()
    assert initial['results'] and all(entry['page'] == 4 for entry in initial['results'])
    continuation = next(item for item in initial['continuations'] if item['pages'] == [])
    # A later-page result from the first alias does not prove that the full
    # source's earlier chunks were emitted. Start before its first missing row.
    assert continuation['after'] == -1
    document_ref = initial['results'][0]['document_ref']
    with factory() as session:
        expected = set(session.scalars(text('SELECT ref FROM corpus_chunks WHERE document_ref=:doc'),
                                       {'doc': document_ref}))
    seen = {entry['ref'] for entry in initial['results']}
    for _ in range(100):
        response = client.post(FETCH, headers=headers, json={'refs': [continuation['ref']],
            'after': continuation['after'], 'pages': continuation['pages'], 'budget': 64000})
        assert response.status_code == 200, response.text
        payload = response.json()
        seen.update(entry['ref'] for entry in payload['results'])
        if not payload['continuations']:
            break
        following = payload['continuations'][0]
        assert following['after'] > continuation['after']
        continuation = following
    else:
        pytest.fail('Full-source continuation did not finish')
    assert seen == expected


@pytest.mark.parametrize('denied', ['course', 'category', 'other_group', 'removed'])
def test_reader_link_uses_current_source_permissions(lecture_source, denied):
    client, factory, _, (course_id, resource_id, version_id), headers = lecture_source
    with factory() as session:
        if denied == 'course':
            session.add(AiAccess(key=f'course:{course_id}', allowed=False))
        elif denied == 'category':
            session.add(AiAccess(key='category:course_material', allowed=False))
        elif denied == 'other_group':
            session.get(Resource, resource_id).group_category = 'other_group'
        else:
            session.get(Resource, resource_id).removed_upstream = True
        session.commit()
    response = client.post(FETCH, headers=headers, json={'refs': [f'/material/{version_id}?page=2']})
    assert response.status_code == 404


@pytest.mark.parametrize('suffix', ['/0', '/-1', '/1?page=0', '/1?page=-2', '/1?page=2&page=3',
                                  '/1?page=2#other', '/1/../2', '/1?other=2', '/1?page=2\n'])
def test_reader_link_rejects_malformed_aliases(lecture_source, suffix):
    client, _, _, _, headers = lecture_source
    assert client.post(FETCH, headers=headers, json={'refs': ['/material' + suffix]}).status_code == 422


def test_reader_link_rejects_conflicting_page_filters_and_unknown_versions(lecture_source):
    client, _, _, (_, _, version_id), headers = lecture_source
    for pages in [[3], [2, 3]]:
        response = client.post(FETCH, headers=headers,
                               json={'refs': [f'/material/{version_id}?page=2'], 'pages': pages})
        assert response.status_code == 422
    assert client.post(FETCH, headers=headers, json={'refs': ['/material/999999?page=2']}).status_code == 404
    assert client.post(FETCH, headers=headers,
                       json={'refs': [f'https://example.invalid/material/{version_id}?page=2']}).status_code == 404
