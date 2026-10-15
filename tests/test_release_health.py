# SPDX-License-Identifier: AGPL-3.0-or-later
"""Only verified, bounded metadata enters the release health report."""
import json
import os
import subprocess
import sys
from pathlib import Path

from app.db.models import ConnectorHealth
from app.recovery.config import recovery_settings
from app.release.repository import ReleaseHealthRepository
from app.release.service import ReleaseHealthService


def test_release_health_uses_actual_queue_and_excludes_connector_messages(settings, factory):
    with factory() as session:
        session.add(ConnectorHealth(connector='moodle', status='error', message='invented private token'))
        session.commit()
    report = ReleaseHealthService(ReleaseHealthRepository(settings.local_dir / 'uni_os.sqlite3')).status()
    assert report['database']['status'] == 'ok'
    assert report['index'] == {'pending': 0, 'failed': 0, 'documents': 0}
    assert report['connectors'] == [{'id': 'moodle', 'status': 'error', 'last_success_at': None}]
    assert 'private' not in json.dumps(report)
    assert report['metadata_status'] == 'available'


def test_release_health_never_invents_a_healthy_missing_database(tmp_path):
    report = ReleaseHealthService(ReleaseHealthRepository(tmp_path / 'absent.sqlite3')).status()
    assert report['database']['status'] == 'error'
    assert report['metadata_status'] == 'unavailable'
    assert report['index'] is None
    assert not (tmp_path / 'absent.sqlite3').exists()


def test_recovery_config_ignores_broken_environment_and_dotenv(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / '.env').write_text('SYNC_INTERVAL_MINUTES=broken\nMCP_TOKEN=invented\n')
    monkeypatch.setenv('SYNC_INTERVAL_MINUTES', 'invalid')
    monkeypatch.setenv('MCP_TOKEN', 'invented')
    settings = recovery_settings(tmp_path, tmp_path / 'frontend')
    assert settings.mcp_token == ''
    assert not settings.moodle_enabled
    assert settings.local_dir == tmp_path / 'local'


def test_factory_only_import_does_not_initialize_a_private_default_app(tmp_path):
    root = Path(__file__).resolve().parents[1]
    environment = {key: value for key, value in os.environ.items() if key.casefold() in
                   {'systemroot', 'windir', 'path', 'temp', 'tmp', 'processor_architecture'}}
    environment.update(PYTHONPATH=str(root), UNIOS_FACTORY_ONLY='true', SYNC_INTERVAL_MINUTES='invalid')
    result = subprocess.run([sys.executable,
                             '-c', "import app.config; app.config.get_settings=lambda: (_ for _ in ()).throw(RuntimeError('private-default-forbidden')); import app.main; assert callable(app.main.create_app); assert not hasattr(app.main,'app')"],
                            cwd=tmp_path, env=environment, capture_output=True, text=True, timeout=30, check=False)
    assert result.returncode == 0, result.stderr
