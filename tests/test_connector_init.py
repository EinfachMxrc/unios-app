# SPDX-License-Identifier: AGPL-3.0-or-later

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.connectors.manifest import ConnectorManifest
from app.connectors.sdk import PermissionedConnector, RemoteResource, connector_context
from scripts.connector_init import create_scaffold


@pytest.mark.parametrize("capabilities", [{"courses.read"}, {"calendar.read"},
                                        {"courses.read", "materials.read", "assignments.read"}])
def test_generated_contract_is_runnable_and_network_free(tmp_path, capabilities):
    root = create_scaffold(tmp_path / "connector", connector_id="fictional_university",
                           university="Erfundene Hochschule", capabilities=capabilities)
    manifest = ConnectorManifest.model_validate(json.loads((root / "manifest.json").read_text()))
    assert manifest.domains == manifest.secrets == set()
    assert manifest.review_status == "reference" and manifest.runtime == "trusted_python"
    spec = importlib.util.spec_from_file_location("scaffold_under_test", root / "connector.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    context = connector_context(manifest, "fixture", {}, {})
    connector = PermissionedConnector(module.create_connector(context), manifest)
    assert connector.fetch_changes().assignments_complete is False
    assert bool(connector.fetch_changes().courses) == ("courses.read" in capabilities)
    with pytest.raises(ValueError):
        context.get("https://example.invalid")
    with pytest.raises(ValueError):
        connector.download(RemoteResource("x", "x", "https://example.invalid", "file"))
    result = subprocess.run([sys.executable, "-m", "pytest", str(root / "tests"), "-q",
                             "--rootdir", str(root), "--confcutdir", str(root),
                             "--override-ini=addopts="], capture_output=True, text=True, timeout=45, check=False,
                            env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])})
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("connector_id,capabilities", [
    ("../escape", {"courses.read"}), ("bad-name", {"courses.read"}),
    ("safe_name", {"submissions.write"}), ("safe_name", {"materials.read"}),
    ("safe_name", {"grades.read"}), ("safe_name", set()),
])
def test_rejects_unsafe_or_reserved_scaffolds_before_writing(tmp_path, connector_id, capabilities):
    root = tmp_path / "connector"
    with pytest.raises(ValueError):
        create_scaffold(root, connector_id=connector_id, university="Erfundene Hochschule",
                        capabilities=capabilities)
    assert not root.exists()


def test_existing_target_is_preserved(tmp_path):
    root = tmp_path / "connector"
    root.mkdir()
    target = root / "connector.py"
    target.write_text("original", encoding="utf-8")
    with pytest.raises(ValueError):
        create_scaffold(root, connector_id="safe_name", university="Erfundene Hochschule")
    assert target.read_text() == "original"


def test_public_connector_init_cli_creates_an_unregistered_fixture(tmp_path, monkeypatch):
    from typer.testing import CliRunner

    from app.cli.main import cli
    monkeypatch.setattr('app.cli.main.get_settings', lambda: pytest.fail('Generator must not load private settings'))
    result = CliRunner().invoke(cli, ['connector', 'init', str(tmp_path / 'fixture'), '--id', 'fictional',
                                    '--university', 'Erfundene Hochschule'])
    assert result.exit_code == 0, result.output
    assert json.loads(result.output)['registered'] is False
    assert (tmp_path / 'fixture' / 'tests' / 'test_contract.py').is_file()
