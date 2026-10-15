# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recovery remains usable without migrations, background work or private diagnostics."""

import hashlib
import json
import sqlite3

from fastapi.testclient import TestClient

from app.recovery.api import create_recovery_app
from app.recovery.repository import RecoveryRepository
from app.recovery.service import RecoveryService


def test_corrupt_database_window_ready_without_migration(settings):
    settings.local_dir.mkdir(parents=True)
    database = settings.local_dir / 'uni_os.sqlite3'
    database.write_bytes(b'invented broken database fixture')
    original = database.read_bytes()
    with TestClient(create_recovery_app(settings)) as client:
        assert client.get('/health').json() == {'status': 'ok', 'mode': 'recovery'}
        report = client.get('/api/recovery/status').json()
        assert report['database']['status'] == 'error'
        assert report['background_work'] is False
        assert client.post('/api/recovery/backup').status_code == 503
        assert client.get('/api/recovery/notes').status_code == 503
        assert client.post('/api/notes').status_code == 405
    assert database.read_bytes() == original
    assert not (settings.local_dir / 'credentials.enc').exists()


def test_checked_backup_preserves_source_and_never_restores(settings, factory):
    database = settings.local_dir / 'uni_os.sqlite3'
    before = hashlib.sha256(database.read_bytes()).hexdigest()
    with TestClient(create_recovery_app(settings)) as client:
        assert client.get('/api/recovery/status').json()['database']['status'] == 'ok'
        first = client.post('/api/recovery/backup').json()
        second = client.post('/api/recovery/backup').json()
        assert first['verified'] is True and first['kind'] == 'database_only'
        assert first['id'] != second['id']
        assert str(settings.local_dir) not in json.dumps(first)
        assert client.post('/api/recovery/restore').status_code == 405
    backup = settings.local_dir / 'recovery-backups' / first['id'] / 'database.sqlite3'
    with sqlite3.connect(backup) as connection:
        assert connection.execute('PRAGMA quick_check').fetchone() == ('ok',)
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before


def test_foreign_origin_and_host_cannot_export_or_create_backup(settings, factory):
    with TestClient(create_recovery_app(settings)) as client:
        assert client.get('/api/recovery/notes', headers={'Host': 'evil.example'}).status_code == 400
        assert client.post('/api/recovery/backup', headers={'Origin': 'https://evil.example'}).status_code == 403
        assert client.get('/api/recovery/files', headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403
    assert not (settings.local_dir / 'recovery-backups').exists()


def test_sources_require_hash_and_contained_path(settings, tmp_path):
    root = settings.data_dir
    root.mkdir(parents=True)
    (root / 'notes').mkdir()
    source = root / 'notes' / 'example.md'
    source.write_bytes(b'fictional note')
    service = RecoveryService(RecoveryRepository(settings.local_dir / 'uni_os.sqlite3'), root, tmp_path / 'out')
    row = {'relative_path': 'notes/example.md', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    assert service.source(row, note=True) == source.resolve()
    source.write_bytes(b'changed')
    import pytest
    with pytest.raises(ValueError, match='CHANGED'):
        service.source(row, note=True)
    for relative in ('../outside', '/outside', '..\\outside'):
        with pytest.raises(ValueError, match='UNSAFE'):
            service.source({'relative_path': relative, 'sha256': row['sha256']})
