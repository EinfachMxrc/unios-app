# SPDX-License-Identifier: AGPL-3.0-or-later

"""Independent synthetic red-team checks for recovery isolation and bounded output."""

import hashlib
import json
import os
from collections import namedtuple

import pytest
from fastapi.testclient import TestClient

from app.recovery.api import create_recovery_app
from app.recovery.repository import RecoveryRepository
from app.recovery.service import RecoveryService
from app.session_api import SESSION_COOKIE_NAME
from app.sessions import SessionStore


def _service(settings):
    settings.local_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return RecoveryService(RecoveryRepository(settings.local_dir / 'uni_os.sqlite3'),
                           settings.data_dir, settings.local_dir / 'recovery-backups')


def _source(settings, content=b'fictional source'):
    folder = settings.data_dir / 'notes'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'example.md'
    path.write_bytes(content)
    return path, {'relative_path': 'notes/example.md', 'sha256': hashlib.sha256(content).hexdigest()}


def test_paired_server_recovery_auth_never_refreshes_or_creates_session_files(settings, factory):
    settings.server_mode = True
    store = SessionStore(settings.local_dir)
    token = store.create_session('fictional test device')
    before = store.path.read_bytes()
    store.lock_path = settings.local_dir / 'never-created.lock'
    assert store.verify_session_readonly(token)
    assert not store.lock_path.exists()
    with TestClient(create_recovery_app(settings)) as client:
        assert client.get('/api/recovery/status').status_code == 401
        client.cookies.set(SESSION_COOKIE_NAME, token)
        assert client.get('/api/recovery/status').status_code == 200
        assert client.post('/api/recovery/backup', headers={'Origin': 'https://foreign.invalid'}).status_code == 403
        assert client.get('/api/recovery/files', headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403
    assert store.path.read_bytes() == before


@pytest.mark.parametrize('raw', [b'not-json', b'{"sessions":[]}', b'{"sessions":{"a":{"token_hash":7}}}',
                                b'x' * (1024 * 1024 + 1)], ids=['bad-json', 'bad-shape', 'bad-hash', 'oversized'])
def test_bad_session_file_fails_closed_without_rewrite(settings, raw):
    settings.local_dir.mkdir(parents=True)
    store = SessionStore(settings.local_dir)
    store.path.write_bytes(raw)
    assert not store.verify_session_readonly('fictional-session')
    assert store.path.read_bytes() == raw and not store.lock_path.exists()


@pytest.mark.parametrize('relative,note', [('credentials.enc', False), ('host/snapshot.json', False),
                                        ('uni/config.txt', True), ('notes/example.md', False),
                                        ('notes/../secret.txt', True)])
def test_valid_hash_cannot_authorize_non_document_roots(settings, relative, note):
    service = _service(settings)
    candidate = settings.data_dir / relative
    candidate.parent.mkdir(parents=True, exist_ok=True)
    candidate.write_bytes(b'fictional excluded bytes')
    with pytest.raises(ValueError, match='UNSAFE'):
        service.verified_export({'relative_path': relative,
                                 'sha256': hashlib.sha256(candidate.read_bytes()).hexdigest()}, note=note)


def test_export_snapshot_does_not_reopen_changed_original_and_slots_are_bounded(settings):
    service = _service(settings)
    path, row = _source(settings)
    name, stream = service.verified_export(row, note=True)
    assert name == 'example.md'
    path.write_bytes(b'changed original after verification')
    try:
        assert stream.read() == b'fictional source'
        with pytest.raises(ValueError, match='BUSY'):
            service.verified_export(row, note=True)
    finally:
        stream.close()
        stream.close()
    with pytest.raises(ValueError, match='CHANGED'):
        service.verified_export(row, note=True)


def test_backup_quota_and_disk_space_fail_without_touching_original(settings, factory, monkeypatch):
    service = _service(settings)
    database = service.repository.database
    before = database.read_bytes()
    DiskUsage = namedtuple('DiskUsage', 'total used free')
    with monkeypatch.context() as patch:
        patch.setattr('app.recovery.service.shutil.disk_usage', lambda path: DiskUsage(100, 99, 1))
        with pytest.raises(ValueError, match='SPACE'):
            service.backup()
    assert database.read_bytes() == before
    monkeypatch.setattr('app.recovery.service.MAX_BACKUPS', 1)
    assert service.backup()['verified'] is True
    with pytest.raises(ValueError, match='QUOTA'):
        service.backup()
    assert database.read_bytes() == before


def test_busy_backup_guard_rejects_concurrent_request(settings, factory):
    service = _service(settings)
    assert service._backup_guard.acquire(blocking=False)
    try:
        with pytest.raises(ValueError, match='BUSY'):
            service.backup()
    finally:
        service._backup_guard.release()
    assert not service.output_dir.exists()


def test_backup_files_are_private_and_metadata_has_no_paths_or_data(settings, factory):
    service = _service(settings)
    metadata = service.backup()
    folder = service.output_dir / metadata['id']
    assert json.loads((folder / 'manifest.json').read_text()) == metadata
    assert set(metadata) == {'id', 'created_at', 'sha256', 'verified', 'kind'}
    for path in (folder / 'database.sqlite3', folder / 'manifest.json'):
        if os.name == 'nt':
            from app.secrets import require_private_env
            require_private_env(path)
        else:
            assert path.stat().st_mode & 0o077 == 0
    if os.name != 'nt':
        assert service.output_dir.stat().st_mode & 0o077 == 0
        assert folder.stat().st_mode & 0o077 == 0
