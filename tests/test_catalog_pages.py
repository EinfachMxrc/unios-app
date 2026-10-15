# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded metadata payloads, literal filters, stable ordering and lazy history."""
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.models import Course, CourseSection, Note, Resource, ResourceVersion
from app.main import create_app


def test_lists_filter_before_pagination_and_do_not_load_history(settings, factory, coordinator):
    with factory() as session:
        course = Course(source='fixture', source_id='catalog', name='Großer Beispielkurs')
        session.add(course)
        session.flush()
        section = CourseSection(course_id=course.id, source_id='example', name='Zielabschnitt', position=1)
        session.add(section)
        session.flush()
        resource_ids = []
        for index in range(121):
            resource = Resource(course_id=course.id, source='fixture', source_key=str(index),
                                section_id=section.id, name=f'Dokument {index:03d}', kind='file', url='')
            session.add(resource)
            session.flush()
            resource_ids.append(resource.id)
            for revision in range(1, 4):
                session.add(ResourceVersion(resource_id=resource.id, version=revision, sha256='a' * 64,
                                            relative_path='invented.txt', size=1, mime_type='text/plain'))
            session.add(Note(id=str(uuid4()), course_id=course.id, title=f'Notiz {index:03d}',
                             current_revision=1, created_at=datetime.now(UTC), updated_at=datetime(2026, 1, 1, tzinfo=UTC)))
        session.commit()
        course_id = course.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        first = client.get(f'/api/courses/{course_id}').json()
        assert len(first['resources']) == 50
        assert first['page'] == {'total': 121, 'limit': 50, 'offset': 0, 'has_more': True}
        assert all(len(value) == 1 and value[0]['version'] == 3 for value in first['versions'].values())
        second = client.get(f'/api/courses/{course_id}?offset=50').json()
        assert {row['id'] for row in first['resources']}.isdisjoint(row['id'] for row in second['resources'])
        selected = client.get(f'/api/courses/{course_id}?q=Dokument%20120').json()
        assert len(selected['resources']) == 1
        assert client.get(f'/api/courses/{course_id}?q=Zielabschnitt').json()['page']['total'] == 121
        assert client.get(f'/api/courses/{course_id}?q=invented.txt').json()['page']['total'] == 121
        assert client.get(f'/api/courses/{course_id}?q=%25').json()['resources'] == []
        focused = client.get(f'/api/courses/{course_id}?resource_id={resource_ids[75]}').json()
        assert focused['page'] == {'total': 121, 'limit': 50, 'offset': 50, 'has_more': True}
        assert len(focused['resources']) == 50
        assert resource_ids[75] in {row['id'] for row in focused['resources']}
        assert client.get(f'/api/courses/{course_id}?resource_id=999999').json()['page']['total'] == 121
        history = client.get(f'/api/resources/{resource_ids[0]}/versions?limit=2').json()
        assert [item['version'] for item in history['versions']] == [3, 2]
        assert history['page']['has_more']
        assert client.get(f'/api/resources/{resource_ids[0]}/versions?offset=2&limit=2').json()['versions'][0]['version'] == 1
        notes = client.get(f'/api/notes?course_id={course_id}').json()
        assert len(notes['notes']) == 50
        assert notes['page']['total'] == 121
        assert client.get(f'/api/notes?course_id={course_id}&q=Notiz%20120').json()['page']['total'] == 1
        next_notes = client.get(f'/api/notes?course_id={course_id}&offset=50').json()
        assert {row['id'] for row in notes['notes']}.isdisjoint(row['id'] for row in next_notes['notes'])
        for path in [f'/api/courses/{course_id}?limit=101', '/api/notes?offset=-1', f'/api/resources/{resource_ids[0]}/versions?limit=0']:
            assert client.get(path).status_code == 422
        assert client.get('/api/resources/999999/versions').status_code == 404
