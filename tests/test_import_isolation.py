# SPDX-License-Identifier: AGPL-3.0-or-later
"""Independent writes during fake downloads/parser work; originals remain versioned."""
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter

import httpx
import pytest
from sqlalchemy import select

from app.connectors.base import RemoteCourse, RemoteResource, Snapshot
from app.connectors.moodle.client import MoodleClient, MoodleError
from app.db.models import Course, ResourceVersion
from app.extract.isolated import ParserCancelled, parse_path
from app.notify.service import Notifier
from app.sync.engine import SyncEngine


def test_download_and_parsing_do_not_hold_the_writer_lock(settings, factory, coordinator, monkeypatch):
    writes = []

    def independent_write(stage):
        def write():
            started = perf_counter()
            with factory() as session:
                session.add(Course(source='fixture-writer', source_id=stage, name=f'Paralleler Schreibtest {stage}'))
                session.commit()
            return perf_counter() - started
        with ThreadPoolExecutor(max_workers=1) as pool:
            writes.append(pool.submit(write).result(timeout=2))

    class Connector:
        name = 'fixture'

        def fetch_changes(self, since=None):
            return Snapshot([RemoteCourse(key='fixture', name='Beispielkurs', resources=[
                RemoteResource(key='fixture', name='Skript.txt', url='https://example.invalid/file', kind='file')])])

        def download(self, resource):
            independent_write('download')
            return b'Original bleibt erhalten'

    def parser(*args):
        independent_write('parser')
        raise ValueError('Fixture parser failure')

    monkeypatch.setattr('app.sync.engine.prepare_pages', parser)
    engine = SyncEngine(factory, settings, [Connector()], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == 'success'
    assert len(writes) == 2 and all(seconds < 2 for seconds in writes)
    with factory() as session:
        version = session.scalar(select(ResourceVersion))
        assert (settings.data_dir / version.relative_path).read_bytes() == b'Original bleibt erhalten'


@pytest.mark.parametrize('headers', [{'content-length': '1000'}, {}])
def test_streamed_download_rejects_declared_and_actual_oversize(settings, monkeypatch, headers):
    monkeypatch.setattr('app.connectors.moodle.client.MAX_DOWNLOAD_BYTES', 64)
    client = MoodleClient(settings)
    client.client.close()
    client.client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b'x' * 128, headers=headers)))
    try:
        with pytest.raises(MoodleError, match='Downloadlimit'):
            client.download(RemoteResource(key='fixture', name='Skript.pdf', url='https://moodle.example.invalid/file', kind='file'))
    finally:
        client.client.close()


def test_isolated_parser_timeout_cancel_and_valid_text(tmp_path):
    source = tmp_path / 'invented.txt'
    source.write_text('Abbruchbedingung beendet Rekursion.', encoding='utf-8')
    with pytest.raises(ValueError, match='PARSER_TIMEOUT'):
        parse_path(source, source.name, 'text/plain', timeout=0)
    with pytest.raises(ParserCancelled):
        parse_path(source, source.name, 'text/plain', cancel=lambda: True)
    assert source.read_text(encoding='utf-8') == 'Abbruchbedingung beendet Rekursion.'
    pages = parse_path(source, source.name, 'text/plain')
    assert len(pages) == 1 and pages[0].text == 'Abbruchbedingung beendet Rekursion.'


def test_bundled_parser_entry_never_initializes_the_application(monkeypatch):
    import sys

    from desktop import backend

    calls = []
    monkeypatch.setattr(sys, 'argv', ['uniosd', '--parser-worker', 'input', 'title', 'mime', 'output', 'progress', 'inline'])
    monkeypatch.setattr(backend, 'application_home', lambda: pytest.fail('Parser must not initialize app home'))
    monkeypatch.setattr('app.extract.parser_worker.run', lambda *args, **kwargs: calls.append((args, kwargs)))
    assert backend.main() == 0
    assert calls[0][1] == {'mode': 'inline'}
