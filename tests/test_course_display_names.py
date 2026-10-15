# SPDX-License-Identifier: AGPL-3.0-or-later
"""A personal course label must never replace its upstream identity."""
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import Course
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from tests.test_moodle_sync import FixtureMoodle


def test_alias_survives_sync_and_cannot_clobber_a_newer_name(settings, factory, coordinator):
    fixture = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [fixture.connector], Notifier(settings, coordinator), coordinator)
    engine.run()
    with factory() as session:
        course = session.scalar(select(Course).where(Course.source_id == '101'))
        course_id, original = course.id, course.name
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        url = f'/api/courses/{course_id}/display-name'
        assert client.patch(url, json={'display_name': '  Prog  1  ', 'expected_display_name': None}).json() == {'display_name': 'Prog 1'}
        assert client.patch(url, json={'display_name': 'Stale', 'expected_display_name': None}).status_code == 409
        assert client.patch(url, json={'display_name': 'x'*81, 'expected_display_name': 'Prog 1'}).status_code == 422
        assert engine.run().status == 'success'
        detail = client.get(f'/api/courses/{course_id}').json()['course']
        assert detail['display_name'] == 'Prog 1'
        assert detail['name'] == original and detail['source_id'] == '101'
        assert client.patch(url, json={'display_name': '', 'expected_display_name': 'Prog 1'}).json() == {'display_name': None}
        assert client.get(f'/api/courses/{course_id}').json()['course']['name'] == original
        assert client.patch('/api/courses/999999/display-name', json={'display_name': 'X', 'expected_display_name': None}).status_code == 404
