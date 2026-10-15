# SPDX-License-Identifier: AGPL-3.0-or-later

"""Test/Fake bootstraps never consult private settings or the system vault."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

GUARDS = r'''
import importlib
import os
from pathlib import Path

import keyring
from pydantic_settings.sources.providers.dotenv import DotEnvSettingsSource

from app import config, secrets
from app import institutions
from app.integrations import storage

def forbidden(*args, **kwargs):
    raise AssertionError("Private configuration/credential access is forbidden in this subprocess")

config.get_settings = forbidden
secrets.require_private_env = forbidden
secrets._secure_backend = forbidden
secrets.load_moodle_token = forbidden
secrets.load_ntfy_url = forbidden
secrets.load_connector_secret = forbidden
institutions.chosen_institution = forbidden
DotEnvSettingsSource._read_env_file = forbidden
for name in ("get_password", "set_password", "delete_password", "get_keyring"):
    setattr(keyring, name, forbidden)
for name in ("available", "read", "save", "remove"):
    setattr(storage.Vault, name, forbidden)
'''


def isolated_import(tmp_path: Path, script: str) -> subprocess.CompletedProcess[str]:
    # Only synthetic files exist in this cwd. Invalid values also catch an
    # accidental Settings() call that bypasses the guarded private resolver.
    (tmp_path / ".env").write_text("HOST_HEARTBEAT_SECONDS=not-a-number\n", encoding="utf-8")
    private = tmp_path / "local"
    private.mkdir()
    (private / "institution.json").write_text("invalid synthetic profile", encoding="utf-8")
    environment = {name: os.environ[name] for name in (
        "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC",
    ) if name in os.environ}
    environment.update({
        "PYTHONPATH": str(ROOT),
        "TEMP": str(tmp_path),
        "TMP": str(tmp_path),
        "TMPDIR": str(tmp_path),
        "UNIOS_FACTORY_ONLY": "false",
        "SERVER_MODE": "true",
        "API_AUTH_REQUIRED": "true",
        "PUBLIC_PERIODS_ENABLED": "true",
        "NTFY_URL": "https://notify.example.invalid/synthetic-poison",
        "DISCORD_WEBHOOK_URL": "https://discord.example.invalid/synthetic-poison",
        "CONNECTOR_PLUGINS": "synthetic-forbidden-plugin",
        "AI_ADAPTER_ENABLED": "true",
        "SERVE_REACT": "false",
    })
    return subprocess.run(
        [sys.executable, "-c", GUARDS + script],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
        timeout=60,
    )


def test_pytest_bootstrap_enforces_factory_only_before_application_imports(tmp_path):
    result = isolated_import(tmp_path, r'''
bootstrap = importlib.import_module("tests.conftest")
assert os.environ["UNIOS_FACTORY_ONLY"] == "false"
# For import-only tests even constructing a Vault is a forbidden side effect.
storage.Vault.__init__ = forbidden
main = importlib.import_module("app.main")
assert not hasattr(main, "app")
settings = bootstrap.settings.__wrapped__(Path.cwd() / "fixture")
assert settings.server_mode is False
assert settings.api_auth_required is False
assert settings.public_periods_enabled is False
assert settings.ntfy_url == settings.discord_webhook_url == ""
assert settings.local_dir.is_relative_to(Path.cwd())
assert not (Path.cwd() / "data").exists()
print("PYTEST_BOOTSTRAP_ISOLATED")
''')
    assert result.returncode == 0, result.stderr
    assert "PYTEST_BOOTSTRAP_ISOLATED" in result.stdout


def test_plain_main_import_does_not_create_a_production_app(tmp_path):
    result = isolated_import(tmp_path, r'''
storage.Vault.__init__ = forbidden
main = importlib.import_module("app.main")
assert not hasattr(main, "app")
print("MAIN_IMPORT_ISOLATED")
''')
    assert result.returncode == 0, result.stderr
    assert "MAIN_IMPORT_ISOLATED" in result.stdout


def test_fake_import_preserves_environment_and_reset_clears_non_database_state(tmp_path):
    result = isolated_import(tmp_path, r'''
# Anki itself adds the standard TeX paths on its first macOS import. Initialize
# that third-party dependency before measuring our fake bootstrap's own effects.
import anki.collection
before = dict(os.environ)
owner = importlib.import_module("tests.fake_servers.phase1_app")
assert dict(os.environ) == before, [key for key in set(before) | set(os.environ) if before.get(key) != os.environ.get(key)]
from app.health import doctor
for relative in ("host/conflicts", "backup-status", "host/snapshots", "uni/manual-card-fixtures", "note-media", "voice"):
    folder = owner.settings.data_dir / relative
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "fictional-leftover.json").write_text("{}")
conflict = owner.settings.data_dir / "host/lease.sync-conflict-fixture.json"
conflict.write_text("{}")
for name in ("addon-events.jsonl", "addon-catalog.jsonl"):
    (owner.settings.local_dir / name).write_text("fictional-event\n")
owner.fake_forwarding.configuration.save({"ready": True})
owner.fake_forwarding.state.save({"enabled": True})
mailbox = owner.fake_forwarding.mailbox / "new"
mailbox.mkdir(parents=True, exist_ok=True)
(mailbox / "fictional-mail").write_text("fictional")
doctor._credential_file = forbidden
owner.app.state.corpus_cache.put("fictional-key", ["old-result"])
owner.reset_for_browser_test()
assert not list(owner.settings.data_dir.rglob("fictional-leftover.json"))
assert not conflict.exists()
assert not list(mailbox.iterdir())
assert doctor._credential_file is owner.original_credential_file_check
assert owner.app.state.corpus_cache.get("fictional-key") is None
assert owner.fake_forwarding.configuration.read() == {}
assert owner.fake_forwarding.state.read() == {}
for name in ("addon-events.jsonl", "addon-catalog.jsonl"):
    assert not (owner.settings.local_dir / name).exists()
owner.host.close()
print("FAKE_RESET_ISOLATED")
''')
    assert result.returncode == 0, result.stderr
    assert "FAKE_RESET_ISOLATED" in result.stdout


@pytest.mark.parametrize("entry", [
    "phase1_app", "standby_app", "handoff_app", "production_app", "disabled_connector_app",
])
def test_fake_app_import_uses_only_explicit_fixture_settings(tmp_path, entry):
    if entry in {"production_app", "disabled_connector_app"} and not (ROOT / "frontend/dist/index.html").is_file():
        pytest.skip("Production fake requires the built React artifact")
    script = r'''
# Mock transports stay usable; actual HTTP transport would fail immediately.
import httpx
httpx.HTTPTransport.handle_request = forbidden
module = importlib.import_module("tests.fake_servers.ENTRY")
owner = importlib.import_module("tests.fake_servers.phase1_app")
main = importlib.import_module("app.main")
assert os.environ["UNIOS_FACTORY_ONLY"] == "false"
assert not hasattr(main, "app")
assert owner.settings.data_dir.is_relative_to(Path.cwd())
assert owner.settings.local_dir.is_relative_to(Path.cwd())
assert owner.settings.server_mode is False
assert owner.settings.api_auth_required is False
assert owner.settings.public_periods_enabled is False
assert owner.settings.ntfy_url == owner.settings.discord_webhook_url == ""
assert owner.settings.ai_adapter_enabled is False
assert owner.settings.connector_plugins == ""
assert owner.config.attributes["settings"] is owner.settings
if hasattr(module, "standby_settings"):
    assert module.standby_settings.server_mode is False
    assert module.standby_settings.api_auth_required is False
    assert module.standby_settings.ntfy_url == module.standby_settings.discord_webhook_url == ""
    assert module.standby_settings.local_dir.is_relative_to(Path.cwd())
if "ENTRY" in {"production_app", "disabled_connector_app"}:
    assert any(getattr(route, "name", None) == "react" for route in module.app.routes)
assert not (Path.cwd() / "data").exists()
owner.host.close()
print("FAKE_BOOTSTRAP_ISOLATED")
'''.replace("ENTRY", entry)
    result = isolated_import(tmp_path, script)
    assert result.returncode == 0, result.stderr
    assert "FAKE_BOOTSTRAP_ISOLATED" in result.stdout
