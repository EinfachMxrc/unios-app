# SPDX-License-Identifier: AGPL-3.0-or-later
"""Quick captures remain addressable beyond the original 200-entry cap."""
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db.models import Assignment, Course, Jot, Note, NoteVersion
from app.main import create_app
from app.notes.store import create_note


def test_jots_paginate_stably_and_resolve_exact_old_target(settings, factory, coordinator):
    with factory() as session:
        course = Course(source='moodle', source_id='synthetic-jots', name='Beispielkurs')
        other = Course(source='moodle', source_id='synthetic-other', name='Anderer Beispielkurs')
        session.add_all([course, other])
        session.flush()
        note = Note(id=str(uuid4()), course_id=course.id, title='Beispielnotiz', current_revision=1)
        session.add(note)
        session.flush()
        ids = [str(UUID(int=index + 1)) for index in range(205)]
        for index, jot_id in enumerate(ids):
            session.add(Jot(id=jot_id, kind='thought', body=f'Synthetischer Eintrag {index}',
                            course_id=course.id, note_id=note.id,
                            created_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=index // 2)))
        session.add(Jot(id=str(uuid4()), kind='question', body='Anderer Kurs', course_id=other.id))
        task = Assignment(course_id=course.id, source='smart_capture', source_key=ids[0], title='Beispielaufgabe')
        session.add(task)
        session.commit()
        course_id, other_id, note_id, task_id = course.id, other.id, note.id, task.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        first_response = client.get('/api/jots')
        assert first_response.status_code == 200, first_response.text
        first = first_response.json()
        assert len(first['jots']) == 20
        assert first['page'] == {'total': 206, 'offset': 0, 'limit': 20, 'has_more': True}
        assert first['notes'][0]['id'] == note_id
        assert first['notes'][0]['course_name'] == 'Beispielkurs'
        second = client.get('/api/jots?offset=20').json()
        assert {row['id'] for row in first['jots']}.isdisjoint(row['id'] for row in second['jots'])
        assert second['jots'] == client.get('/api/jots?offset=20').json()['jots']
        last = client.get(f'/api/jots?offset=200&course_id={course_id}').json()
        assert len(last['jots']) == 5
        assert last['page'] == {'total': 205, 'offset': 200, 'limit': 20, 'has_more': False}
        targeted = client.get('/api/jots', params={'jot_id': ids[0].upper()}).json()
        assert len(targeted['jots']) == 1
        assert targeted['jots'][0]['id'] == ids[0]
        assert targeted['jots'][0]['task_id'] == task_id
        assert targeted['jots'][0]['task_course_id'] == course_id
        assert targeted['jots'][0]['body'] == 'Synthetischer Eintrag 0'
        assert targeted['page']['total'] == 1
        assert client.get('/api/jots', params={'course_id': other_id}).json()['page']['total'] == 1
        assert client.get('/api/jots', params={'course_id': other_id, 'jot_id': ids[0]}).json()['jots'] == []
        assert client.get('/api/jots', params={'jot_id': str(uuid4())}).json()['jots'] == []
        moved = client.patch(f'/api/jots/{ids[0]}/assignment', json={'course_id': other_id})
        assert moved.status_code == 200, moved.text
        assert moved.json()['task_course_id'] == course_id
        moved_read = client.get('/api/jots', params={'jot_id': ids[0]}).json()['jots'][0]
        assert moved_read['course_id'] == other_id
        assert moved_read['task_course_id'] == course_id
        assert moved_read['task_id'] == task_id
        for query in ('offset=-1', 'limit=101', 'limit=0', 'jot_id=not-a-uuid'):
            assert client.get(f'/api/jots?{query}').status_code == 422


def test_jot_note_copy_uses_existing_version_and_host_fences_without_reassigning_original(settings, factory, coordinator):
    jot_id = str(uuid4())
    with factory() as session:
        session.execute(text('CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)'))
        course = Course(source='moodle', source_id='transfer-example', name='Beispielkurs')
        session.add(course)
        session.commit()
        note = create_note(session, settings, course_id=course.id, resource_id=None,
                           title='Originaltitel', body='Bisherige Mitschrift')
        note_id = note.id
        session.add(Jot(id=jot_id, kind='question', body='Ursprüngliche Frage', course_id=course.id, note_id=note_id))
        session.commit()
        course_id = course.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        generation = client.get('/api/host').json()['generation']
        headers = {'X-UniOS-Lease-Generation': str(generation)}
        current = client.get(f'/api/notes/{note_id}').json()
        body = f"{current['body']}\n\nUrsprüngliche Frage\n\n[Quelle](/jots#jot-{jot_id})"
        payload = {'title': current['note']['title'], 'body': body,
                   'expected_revision': current['note']['current_revision']}
        saved = client.put(f'/api/notes/{note_id}', json=payload, headers=headers)
        assert saved.status_code == 200, saved.text
        assert saved.json()['note']['current_revision'] == 2
        assert saved.json()['body'] == body
        # A racing duplicate with the old baseline cannot add a second version.
        assert client.put(f'/api/notes/{note_id}', json=payload, headers=headers).status_code == 409
        stale_host = client.put(f'/api/notes/{note_id}', json={**payload, 'body': body + '\nAndere Änderung',
                                'expected_revision': 2}, headers={'X-UniOS-Lease-Generation': str(generation + 1)})
        assert stale_host.status_code == 409
        assert stale_host.json()['detail'].startswith('STALE_HOST')
        original = client.get('/api/jots', params={'jot_id': jot_id}).json()['jots'][0]
        assert original['body'] == 'Ursprüngliche Frage'
        assert original['note_id'] == note_id
        assert original['course_id'] == course_id
        assert client.get(f'/api/notes/{note_id}?revision=1').json()['body'] == 'Bisherige Mitschrift'
    with factory() as session:
        assert len(session.scalars(select(NoteVersion).where(NoteVersion.note_id == note_id)).all()) == 2
