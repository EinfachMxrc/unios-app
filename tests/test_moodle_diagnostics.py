# SPDX-License-Identifier: AGPL-3.0-or-later
"""Diagnose partial assignment access without leaking Moodle response content."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.connectors.moodle.diagnostics import assignment_warning_details
from app.db.models import Assignment, ConnectorHealth, Deadline, Notification
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from tests.test_moodle_sync import FixtureMoodle


@pytest.mark.parametrize(("item", "code", "expected"), [
    ("course", "1", "Kurs-ID 101, Code 1: Kein Zugriff auf den Kurskontext"),
    ("course", 2, "Kurs-ID 101, Code 2: Keine aktive Einschreibung oder erforderliche Kursberechtigung"),
    ("module", "1", "Kurs-ID 101, Aktivitäts-ID 9001, Code 1: Kein Zugriff auf den Aktivitätskontext"),
])
def test_assignment_diagnosis_survives_sync_and_is_private(
    settings, factory, coordinator, caplog, item, code, expected,
):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    # Even an activity in a hidden section can be attributed if Moodle actually
    # supplies its ID. It is still excluded from imported course contents.
    moodle.contents[101].append({
        "id": 9000, "uservisible": False,
        "modules": [{"id": 9001, "modname": "assign", "name": "Fictional hidden assignment"}],
    })
    moodle.responses["mod_assign_get_assignments"] = {
        "courses": [], "warnings": [{
            "item": item, "itemid": 101 if item == "course" else 9001, "warningcode": code,
            "message": "private-response@example.invalid https://moodle.example.invalid/?wstoken=fixture-secret",
        }],
    }
    moodle.calls.clear()
    assert engine.run().status == "warning"
    assert sum(function == "mod_assign_get_assignments" for function, _ in moodle.calls) == 1
    with factory() as session:
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "moodle"))
        assert expected in health.message
        assert "angefragte Kurse: 2, gelieferte Kurse: 0, Warnungen: 1" in health.message
        assert session.scalar(select(Assignment)).removed_upstream is False
        assert session.scalar(select(Deadline)).removed_upstream is False
        for notification in session.scalars(select(Notification)).all():
            assert 'Moodle-Aufgabendiagnose' not in notification.body
            assert 'Aktivitäts-ID' not in notification.body
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        system = client.get('/api/system').json()
        assert expected in next(row['message'] for row in system['health'] if row['connector'] == 'moodle')
        exported = json.dumps(client.get('/api/feedback/diagnostics').json())
        release_health = json.dumps(client.get('/api/release/health').json())
    assert 'Aktivitäts-ID' not in exported + release_health
    assert 'Moodle-Aufgabendiagnose' not in exported + release_health
    assert 'Moodle-Aufgabendiagnose' not in caplog.text
    assert 'fixture-secret' not in json.dumps(system) + exported + release_health + caplog.text
    assert 'private-response@example.invalid' not in json.dumps(system) + caplog.text


def test_successful_assignment_fetch_clears_previous_diagnostics(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    original = moodle.responses['mod_assign_get_assignments']
    moodle.responses['mod_assign_get_assignments'] = {
        'courses': [], 'warnings': [{'item': 'course', 'itemid': 101, 'warningcode': '1'}],
    }
    assert engine.run().status == 'warning'
    with factory() as session:
        assert 'Kurs-ID 101' in session.scalar(select(ConnectorHealth)).message
    moodle.responses['mod_assign_get_assignments'] = original
    assert engine.run().status == 'success'
    with factory() as session:
        health = session.scalar(select(ConnectorHealth))
        assert health.status == 'ok'
        assert health.message is None


def test_unlisted_activity_keeps_id_but_does_not_guess_course_or_reason():
    details = '; '.join(assignment_warning_details([
        {'item': 'module', 'itemid': 9002, 'warningcode': '1'},
    ], {'101'}, {}, 1))
    assert 'Kurs nicht zuordenbar, Aktivitäts-ID 9002' in details
    assert 'Kurs-ID 101' not in details
    assert 'verborgen' not in details
    assert 'Token' not in details


@pytest.mark.parametrize('value', [True, -1, 0, 1.5, '١', '../../?token=fixture-secret', '9' * 100, None])
def test_untrusted_warning_values_cannot_enter_health(value):
    details = '; '.join(assignment_warning_details([
        {'item': 'module', 'itemid': value, 'warningcode': 'fixture-secret', 'message': 'fixture-secret'},
        {'item': 'fixture-secret', 'itemid': value, 'warningcode': True},
    ], {'101'}, {}, 0))
    assert 'fixture-secret' not in details
    assert 'Aktivitäts-ID' not in details
    assert 'Code unbekannt' in details


@pytest.mark.parametrize('value', ['fixture-secret', {'message': 'fixture-secret'}, True])
def test_malformed_warning_collection_is_reported_without_raw_payload(value):
    details = '; '.join(assignment_warning_details(value, {'101'}, {}, 0))
    assert 'Warnungsformat unbekannt' in details
    assert 'fixture-secret' not in details


def test_warning_output_is_bounded_and_reports_truncation():
    details = assignment_warning_details([
        {'item': 'module', 'itemid': 9000 + index, 'warningcode': '1'} for index in range(25)
    ], {'101'}, {}, 1)
    assert len(details) == 22
    assert 'Warnungen: 25' in details[0]
    assert 'weitere Warnungen: 5' in details[-1]
    assert not any('Aktivitäts-ID 9020' in line for line in details)


def test_malformed_warning_entry_does_not_abort_other_diagnostics():
    details = '; '.join(assignment_warning_details([
        None, {'item': 'course', 'itemid': 101, 'warningcode': '1'},
    ], {'101'}, {}, 1))
    assert 'ungültiger Warnungseintrag' in details
    assert 'Kurs-ID 101, Code 1' in details


def accessible_assignments_response():
    return {
        'courses': [
            {'id': 101, 'assignments': [{'id': 701, 'cmid': 9000}]},
            {'id': 202, 'assignments': []},
        ],
        'warnings': [{'item': 'module', 'itemid': 9001, 'warningcode': '1'}],
    }


@pytest.mark.parametrize('mutation', [
    'missing_course', 'duplicate_course', 'wrong_course', 'missing_visible',
    'visible_denied', 'returned_denied', 'unknown_code', 'course_denied',
    'invalid_id', 'invalid_code', 'malformed_warning', 'malformed_assignments',
    'missing_cmid', 'wrong_course_assignment',
])
def test_restriction_classification_does_not_hide_incomplete_or_ambiguous_responses(mutation):
    from app.connectors.moodle.diagnostics import expected_assignment_restrictions

    response = accessible_assignments_response()
    visible = {'101': {'9000'}, '202': set()}
    assert expected_assignment_restrictions(response, {'101', '202'}, visible)
    if mutation == 'missing_course':
        response['courses'].pop()
    elif mutation == 'duplicate_course':
        response['courses'].append(response['courses'][0])
    elif mutation == 'wrong_course':
        response['courses'][1]['id'] = 303
    elif mutation == 'missing_visible':
        response['courses'][0]['assignments'] = []
    elif mutation == 'visible_denied':
        visible['101'].add('9001')
    elif mutation == 'returned_denied':
        response['warnings'][0]['itemid'] = 9000
    elif mutation == 'unknown_code':
        response['warnings'][0]['warningcode'] = '2'
    elif mutation == 'course_denied':
        response['warnings'][0]['item'] = 'course'
    elif mutation == 'invalid_id':
        response['warnings'][0]['itemid'] = True
    elif mutation == 'invalid_code':
        response['warnings'][0]['warningcode'] = True
    elif mutation == 'malformed_warning':
        response['warnings'] = [None]
    elif mutation == 'malformed_assignments':
        response['courses'][0]['assignments'] = None
    elif mutation == 'missing_cmid':
        response['courses'][0]['assignments'][0].pop('cmid')
    elif mutation == 'wrong_course_assignment':
        response['courses'][1]['assignments'] = response['courses'][0]['assignments']
        response['courses'][0]['assignments'] = []
    assert not expected_assignment_restrictions(response, {'101', '202'}, visible)


@pytest.mark.parametrize('known_hidden', [False, True])
def test_expected_inaccessible_assignments_are_private_notices_and_keep_deadlines(
    settings, factory, coordinator, caplog, known_hidden,
):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == 'success'
    # An assignment previously visible to this account is now inaccessible.
    # It must not be marked removed merely because it is absent from contents.
    if known_hidden:
        moodle.contents[101][0]['modules'].append({
            'id': 9001, 'modname': 'assign', 'uservisible': False,
        })
    response = accessible_assignments_response()
    response['courses'][0]['assignments'] = []
    response['warnings'][0]['message'] = 'private-message@example.invalid?token=fixture-secret'
    moodle.responses['mod_assign_get_assignments'] = response
    moodle.calls.clear()
    assert engine.run().status == 'success'
    assert sum(fn == 'mod_assign_get_assignments' for fn, _ in moodle.calls) == 1
    with factory() as session:
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == 'moodle'))
        assert health.status == 'ok'
        assert 'nicht zugängliche Aktivitäten ausgelassen' in health.message
        assert 'Code 1: Kein Zugriff auf den Aktivitätskontext' in health.message
        assert 'konnte nicht alle Aufgaben prüfen' not in health.message
        assert session.scalar(select(Assignment)).removed_upstream is False
        assert session.scalar(select(Deadline)).removed_upstream is False
        assert not session.scalars(select(Notification).where(Notification.event_key.like('connector-warning:%'))).all()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        system = client.get('/api/system').json()
        private = next(h for h in system['health'] if h['connector'] == 'moodle')
        assert private['status'] == 'ok' and 'Moodle-Aufgabendiagnose' in private['message']
        assert 'Moodle-Aufgabendiagnose' not in json.dumps(client.get('/api/release/health').json())
        assert 'Moodle-Aufgabendiagnose' not in json.dumps(client.get('/api/feedback/diagnostics').json())
    assert 'fixture-secret' not in json.dumps(system) + caplog.text
    assert 'Moodle-Aufgabendiagnose' not in caplog.text


def test_visible_assignment_missing_from_response_still_warns(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    moodle.contents[101][0]['modules'].append({'id': 9000, 'modname': 'assign'})
    response = accessible_assignments_response()
    response['courses'][0]['assignments'] = []
    moodle.responses['mod_assign_get_assignments'] = response
    snapshot = moodle.connector.fetch_changes()
    assert snapshot.assignments_complete is False
    assert snapshot.notices == []
    assert any('konnte nicht alle Aufgaben prüfen' in w for w in snapshot.warnings)
