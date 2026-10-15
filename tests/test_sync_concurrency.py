# SPDX-License-Identifier: AGPL-3.0-or-later
"""Exercise resource publication against a competing writer on real WAL SQLite."""

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import event, func, select, text

from app.db.models import Course, ResourceVersion
from app.db.session import begin_write_transaction, make_engine, make_session_factory
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from tests.test_moodle_sync import FixtureMoodle


@pytest.mark.parametrize('mode', ['sync', 'ingest'])
def test_resource_refresh_survives_concurrent_writer(settings, factory, coordinator, mode):
    # `factory` creates the complete synthetic schema. Use the production engine
    # for both competing connections, including its WAL and timeout settings.
    database = make_engine(settings, coordinator)
    sessions = make_session_factory(database)
    moodle = FixtureMoodle(settings)
    sync = SyncEngine(sessions, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert sync.run().status == 'success'
    with sessions() as session:
        course_id = session.scalar(select(Course.id).order_by(Course.id))
        versions_before = session.scalar(select(func.count()).select_from(ResourceVersion))

    reading = threading.Event()
    writing = threading.Event()
    committed = threading.Event()

    def competing_writer():
        assert reading.wait(10)
        with sessions() as session:
            course = session.get(Course, course_id)
            course.is_active = False
            writing.set()
            session.commit()
        committed.set()

    def after_read(connection, _cursor, statement, _parameters, _context, _many):
        if (not reading.is_set() and connection.in_nested_transaction()
                and statement.lstrip().startswith('SELECT resources.') and 'FROM resources' in statement):
            reading.set()
            assert writing.wait(10)
            # Previously this writer could commit inside the reader's savepoint,
            # making its next autoflush fail with SQLITE_BUSY_SNAPSHOT. With a
            # reserved write transaction it waits until publication commits.
            committed.wait(.2)

    event.listen(database, 'after_cursor_execute', after_read)
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            other = pool.submit(competing_writer)
            try:
                if mode == 'sync':
                    result = sync.run()
                    assert result.status == 'success', result.error
                else:
                    snapshot = moodle.connector.fetch_changes()
                    assert sync.ingest_documents(moodle.connector, snapshot.courses) == (0, 0)
            finally:
                reading.set()  # Never strand the competing thread after a failure.
                other.result(timeout=15)
        assert committed.is_set()
        with sessions() as session:
            assert session.get(Course, course_id).is_active is False
            assert session.scalar(select(func.count()).select_from(ResourceVersion)) == versions_before
    finally:
        event.remove(database, 'after_cursor_execute', after_read)
        database.dispose()


def test_downloads_leave_the_database_available_to_writers(settings, factory, coordinator, monkeypatch):
    database = make_engine(settings, coordinator)
    sessions = make_session_factory(database)
    moodle = FixtureMoodle(settings)
    download = moodle.connector.download
    observations = []

    def while_downloading(resource):
        with database.begin() as connection:
            connection.exec_driver_sql('PRAGMA busy_timeout=50')
            result = connection.execute(text('UPDATE courses SET is_active=0'))
            observations.append(result.rowcount)
        return download(resource)

    monkeypatch.setattr(moodle.connector, 'download', while_downloading)
    try:
        sync = SyncEngine(sessions, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
        assert sync.run().status == 'success'
        assert len(observations) == 2 and all(count > 0 for count in observations)
        with sessions() as session:
            assert all(not course.is_active for course in session.scalars(select(Course)))
    finally:
        database.dispose()


def test_outer_rollback_undoes_released_resource_savepoint(settings, factory, coordinator):
    database = make_engine(settings, coordinator)
    sessions = make_session_factory(database)
    try:
        with sessions() as session:
            course = Course(source='fixture', source_id='rollback', name='Fictional original')
            session.add(course)
            session.commit()
            identifier = course.id
        with sessions() as session:
            begin_write_transaction(session)
            with session.begin_nested():
                session.get(Course, identifier).name = 'Fictional unpublished edit'
            session.rollback()
        with sessions() as session:
            assert session.get(Course, identifier).name == 'Fictional original'
    finally:
        database.dispose()


@pytest.mark.parametrize('fenced', [True, False])
def test_production_connections_have_bounded_writer_wait(settings, factory, coordinator, fenced):
    database = make_engine(settings, coordinator if fenced else None)
    try:
        with database.connect() as connection:
            assert connection.exec_driver_sql('PRAGMA busy_timeout').scalar() == 30_000
    finally:
        database.dispose()
