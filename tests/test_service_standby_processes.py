# SPDX-License-Identifier: AGPL-3.0-or-later

"""Prove the real service entry point keeps a second device read-only."""

import hashlib
import os
import socket
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource
from sqlalchemy import create_engine

from app.config import Settings
from app.db.models import Base
from app.host.lease import HostCoordinator
from app.secrets import secure_windows_env

ROOT = Path(__file__).resolve().parents[1]


class ServiceSetupSettings(Settings):
    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (init_settings,)


SERVICE_GUARDS = r'''
import os
import runpy
import socket
import sys
from ipaddress import ip_address
from pathlib import Path

import httpx
import keyring
from pydantic_settings.sources.providers.dotenv import DotEnvSettingsSource

from app import config, institutions, secrets
from app.integrations import storage

runner = Path(sys.argv[1]).resolve()
stage = runner.parents[1]
assert Path.cwd().resolve() == stage
assert os.environ["UNIOS_FACTORY_ONLY"] == "false"

def within_stage(path):
    assert Path(path).resolve().is_relative_to(stage), "Configuration escaped the synthetic stage"

def forbidden(*args, **kwargs):
    raise AssertionError("System credentials and external network are forbidden in this subprocess")

for name in ("get_password", "set_password", "delete_password", "get_keyring"):
    setattr(keyring, name, forbidden)
for name in ("_secure_backend", "load_moodle_token", "load_ntfy_url", "load_connector_secret"):
    setattr(secrets, name, forbidden)
storage._secure_backend = forbidden

class EmptyVault:
    def __init__(self, directory, institution, name):
        within_stage(directory)

    @staticmethod
    def available():
        return False

    def read(self, alias):
        return {}

    save = remove = forbidden

storage.Vault = EmptyVault
private_env = secrets.require_private_env
def synthetic_private_env(path):
    within_stage(path)
    return private_env(path)
secrets.require_private_env = synthetic_private_env

read_env_file = DotEnvSettingsSource._read_env_file
def synthetic_env_file(self, path):
    within_stage(path)
    return read_env_file(self, path)
DotEnvSettingsSource._read_env_file = synthetic_env_file

chosen_institution = institutions.chosen_institution
def synthetic_institution(directory):
    within_stage(directory)
    return chosen_institution(directory)
institutions.chosen_institution = synthetic_institution

get_settings = config.get_settings
def synthetic_settings():
    assert Path.cwd().resolve() == stage
    settings = get_settings()
    for path in (settings.data_dir, settings.local_dir, settings.react_dist_dir):
        within_stage(path)
    assert settings.institution_slug == "generic"
    assert not settings.server_mode and not settings.api_auth_required
    assert not settings.moodle_enabled and not settings.public_periods_enabled
    assert settings.ntfy_url == "disabled-for-synthetic-service-test"
    assert not settings.connector_plugins and not settings.ai_adapter_enabled
    print("SYNTHETIC_SERVICE_BOOTSTRAP", flush=True)
    return settings
config.get_settings = synthetic_settings

httpx.HTTPTransport.handle_request = forbidden
httpx.AsyncHTTPTransport.handle_async_request = forbidden
getaddrinfo = socket.getaddrinfo
def loopback_dns(host, *args, **kwargs):
    assert host == "localhost" or ip_address(host).is_loopback, "External DNS is forbidden"
    return getaddrinfo(host, *args, **kwargs)
socket.getaddrinfo = loopback_dns
connect = socket.socket.connect
def loopback_connect(self, address):
    assert isinstance(address, tuple) and ip_address(address[0]).is_loopback, "External sockets are forbidden"
    return connect(self, address)
socket.socket.connect = loopback_connect

runpy.run_path(str(runner), run_name="__main__")
'''


def _stage_service(directory: Path) -> Path:
    # run_service changes cwd to its own ROOT. A byte-identical staged copy
    # makes that real bootstrap safe without changing production behavior.
    scripts = directory / "scripts"
    scripts.mkdir()
    source = (ROOT / "scripts" / "run_service.py").read_bytes()
    runner = scripts / "run_service.py"
    runner.write_bytes(source)
    assert runner.read_bytes() == source
    env_file = directory / ".env"
    env_file.write_text("# Synthetic service-test configuration only\n", encoding="utf-8")
    env_file.chmod(0o600)
    if os.name == "nt":
        secure_windows_env(env_file)
    return runner


def _free_port() -> int:
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        return connection.getsockname()[1]


def _service_environment(shared: Path, local: Path, dist: Path, port: int, name: str) -> dict[str, str]:
    stage = shared.parent
    local.mkdir(exist_ok=True)
    (local / "institution-profile.json").write_text('{"version": 1, "slug": "generic"}', encoding="utf-8")
    environment = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "WINDIR", "COMSPEC")
                   if key in os.environ}
    return {**environment, "PYTHONPATH": str(ROOT), "UNIOS_FACTORY_ONLY": "false",
            "TEMP": str(stage), "TMP": str(stage), "TMPDIR": str(stage),
            "HOME": str(stage / "os-home"), "USERPROFILE": str(stage / "os-home"),
            "APPDATA": str(stage / "os-home" / "AppData" / "Roaming"),
            "LOCALAPPDATA": str(stage / "os-home" / "AppData" / "Local"),
            "DATA_DIR": str(shared), "LOCAL_DIR": str(local),
            "DATABASE_URL": f"sqlite:///{local / 'uni_os.sqlite3'}",
            "REACT_DIST_DIR": str(dist), "UNIOS_API_PORT": str(port), "UNIOS_BIND": "127.0.0.1",
            "DEVICE_NAME": name, "INSTITUTION_SLUG": "generic", "MOODLE_ENABLED": "false",
            "MOODLE_BASE_URL": "", "MOODLE_TOKEN": "", "SERVER_MODE": "false",
            "PUBLIC_PERIODS_ENABLED": "false", "API_AUTH_REQUIRED": "false",
            "NTFY_URL": "disabled-for-synthetic-service-test", "DISCORD_WEBHOOK_URL": "",
            "CONNECTOR_PLUGINS": "", "AI_ADAPTER_ENABLED": "false"}


def _wait_for_service(process: subprocess.Popen[str], port: int) -> dict:
    deadline = time.monotonic() + 25
    url = f"http://127.0.0.1:{port}/api/host"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            raise AssertionError(f"Dienst endete mit Status {process.returncode}: {stdout}\n{stderr}")
        try:
            response = httpx.get(url, timeout=1, trust_env=False)
            if response.status_code == 200:
                return response.json()
        except httpx.TransportError:
            pass
        time.sleep(0.1)
    raise AssertionError("Dienst wurde nicht bereit")


def _stop(process: subprocess.Popen[str]) -> tuple[str, str]:
    if process.poll() is None:
        process.terminate()
    try:
        return process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        return process.communicate(timeout=10)


@pytest.mark.parametrize("bind", ["0.0.0.0", "::", "192.168.1.10", "localhost"])
def test_native_service_rejects_non_loopback_bind(tmp_path, bind):
    runner = _stage_service(tmp_path)
    dist = tmp_path / "react-dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>UniOS</title>", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, "-c", SERVICE_GUARDS, str(runner)], cwd=tmp_path,
        env={**_service_environment(tmp_path / "shared", tmp_path / "local", dist, 8000, "Test"),
             "UNIOS_BIND": bind},
        capture_output=True, text=True, timeout=10, check=False,
    )
    assert result.returncode == 2
    assert "nur an eine Loopback-IP" in result.stderr


def test_second_real_service_on_shared_data_stays_read_only(tmp_path, monkeypatch):
    # Production integration deliberately overrides pytest's import-only flag,
    # while hostile inherited settings cannot reach either child process.
    monkeypatch.setenv("UNIOS_FACTORY_ONLY", "true")
    monkeypatch.setenv("SERVER_MODE", "true")
    monkeypatch.setenv("NTFY_URL", "https://notify.example.invalid/forbidden")
    monkeypatch.setenv("CONNECTOR_PLUGINS", "forbidden-test-plugin")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("NO_PROXY", "")
    runner = _stage_service(tmp_path)
    shared = tmp_path / "shared"
    owner_local = tmp_path / "owner"
    standby_local = tmp_path / "standby"
    dist = tmp_path / "react-dist"
    owner_local.mkdir()
    standby_local.mkdir()
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>UniOS</title>", encoding="utf-8")
    owner_settings = ServiceSetupSettings(_env_file=None, data_dir=shared, local_dir=owner_local,
                              database_url=f"sqlite:///{owner_local / 'uni_os.sqlite3'}",
                              institution_slug="generic", moodle_enabled=False,
                              public_periods_enabled=False, api_auth_required=False,
                              device_name="Test-Host")
    database = create_engine(owner_settings.database_url)
    Base.metadata.create_all(database)
    database.dispose()
    standby_database = standby_local / "uni_os.sqlite3"
    with sqlite3.connect(owner_local / "uni_os.sqlite3") as source, sqlite3.connect(standby_database) as target:
        source.backup(target)
    coordinator = HostCoordinator(owner_settings)
    lease = coordinator.acquire_initial()
    owner_port, standby_port = _free_port(), _free_port()
    while standby_port == owner_port:
        standby_port = _free_port()
    owner = subprocess.Popen([sys.executable, "-c", SERVICE_GUARDS, str(runner)], cwd=tmp_path,
                             env=_service_environment(shared, owner_local, dist, owner_port, "Test-Host"),
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        owner_status = _wait_for_service(owner, owner_port)
        assert owner_status["mode"] == "host"
        assert owner_status["generation"] == lease.generation
        before_database = hashlib.sha256(standby_database.read_bytes()).hexdigest()
        before_shared_files = {path.relative_to(shared) for path in shared.rglob("*") if path.is_file()}
        standby = subprocess.Popen([sys.executable, "-c", SERVICE_GUARDS, str(runner)], cwd=tmp_path,
                                   env=_service_environment(shared, standby_local, dist, standby_port, "Test-Zuschauer"),
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            status = _wait_for_service(standby, standby_port)
            assert status["mode"] == "standby"
            assert status["device_name"] == "Test-Host"
            assert status["generation"] == lease.generation
            base = f"http://127.0.0.1:{standby_port}"
            with httpx.Client(timeout=3, trust_env=False) as client:
                assert client.get(f"{base}/").status_code == 200
                assert client.get(f"{base}/more").status_code == 200
                assert client.get(f"{base}/settings").status_code == 200
                assert client.get(f"{base}/api/overview").status_code == 200
                assert client.post(f"{base}/api/semesters", json={"name": "Gesperrt"}).status_code == 423
                assert client.post(f"{base}/api/sync").status_code == 423
                assert client.post(f"{base}/api/host/snapshot").status_code == 423
            assert hashlib.sha256(standby_database.read_bytes()).hexdigest() == before_database
            assert {path.relative_to(shared) for path in shared.rglob("*") if path.is_file()} == before_shared_files
            assert _wait_for_service(owner, owner_port)["mode"] == "host"
        finally:
            stdout, _stderr = _stop(standby)
        assert "SYNTHETIC_SERVICE_BOOTSTRAP" in stdout
    finally:
        stdout, _stderr = _stop(owner)
    assert "SYNTHETIC_SERVICE_BOOTSTRAP" in stdout
