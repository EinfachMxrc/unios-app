# SPDX-License-Identifier: AGPL-3.0-or-later
"""Integrity, authenticated transport and non-destructive server import."""

import os
import sqlite3
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag

from app.host.lease import HostCoordinator
from app.server.migration import export, import_package, portable_database_paths
from app.server.transfer import EncryptedReader, EncryptedWriter
from tests.test_server_client import (
    secure_keyring,  # noqa: F401 - shared fictional vault fixture
)


@pytest.mark.usefixtures("secure_keyring")
def test_old_schema_restores_and_migrates_in_a_fresh_target(settings, tmp_path, monkeypatch):
    from alembic.config import Config

    from alembic import command
    from app.config import Settings

    root = Path(__file__).parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.attributes["settings"] = settings
    source_host = HostCoordinator(settings)
    source_host.acquire_initial()
    config.attributes["host_coordinator"] = source_host
    try:
        command.upgrade(config, "fe69ba213d4e")
    finally:
        source_host.close()
    config.attributes.pop("host_coordinator")
    with sqlite3.connect(settings.local_dir / "uni_os.sqlite3") as database:
        database.execute("INSERT INTO semesters (name, is_current) VALUES ('Fictional old semester', 1)")
    key = os.urandom(32)
    package = tmp_path / "old.enc"
    export(settings, package, key)
    from cryptography.fernet import Fernet

    master = tmp_path / "fixture-server.key"
    master.write_bytes(Fernet.generate_key())
    master.chmod(0o600)
    monkeypatch.setenv("UNIOS_SERVER_KEY", str(master))
    target = tmp_path / "new-version"
    result = import_package(target, package, key)
    assert result["schema_revision"] == "fe69ba213d4e"
    config.attributes["settings"] = Settings(_env_file=None, data_dir=target / "data", local_dir=target / "local", moodle_enabled=False)
    command.upgrade(config, "head")
    with sqlite3.connect(target / "local" / "uni_os.sqlite3") as database:
        assert database.execute("SELECT name FROM semesters").fetchone() == ("Fictional old semester",)
        assert database.execute("SELECT COUNT(*) FROM background_jobs").fetchone() == (0,)


@pytest.mark.usefixtures("secure_keyring")
def test_migration_keeps_source_and_preserves_database_and_files(settings, factory, coordinator,
                                                                 tmp_path, monkeypatch):
    from app.config import Settings

    document = settings.data_dir / "uni" / "fictional.pdf"
    document.parent.mkdir(parents=True)
    document.write_bytes(b"fictional-document")
    linked = document.with_name("linked.pdf")
    os.link(document, linked)
    (settings.local_dir / "setup.json").write_text('{"completed":true}')
    (settings.local_dir / "campus.json").write_text('{"program":{"name":"Fictional programme"}}')
    (settings.local_dir / "timetable-selection-connection.json").write_text(
        '{"version":1,"institution":"generic","hidden":["' + 'a' * 64 + '"]}')
    (settings.local_dir / "sessions.json").write_text('{"must_not_move":"private-device-cookie"}')
    (settings.local_dir / "ai-provider.json").write_text('{"model":"fictional-model"}')
    # The key is loaded lazily, so settings still has none before the first AI call.
    from app.ai.provider_repository import ProviderRepository

    ProviderRepository(settings).save_key("fictional-ai-key")
    assert settings.ai_adapter_api_key == ""
    from hashlib import sha256

    binary = b"fictional-wasm-bytes"
    module_name = sha256(binary).hexdigest() + ".wasm"
    (settings.local_dir / "addon-modules").mkdir()
    (settings.local_dir / "addon-modules" / module_name).write_bytes(binary)
    generation = coordinator.current().generation
    coordinator.close()
    key = os.urandom(32)
    package = tmp_path / "move.enc"
    export(settings, package, key)
    assert b"fictional-document" not in package.read_bytes()
    assert document.read_bytes() == b"fictional-document"
    target = tmp_path / "server"
    master = tmp_path / "server.key"
    from cryptography.fernet import Fernet

    master.write_bytes(Fernet.generate_key())
    master.chmod(0o600)
    monkeypatch.setenv("UNIOS_SERVER_KEY", str(master))
    result = import_package(target, package, key)
    assert result["verified"]
    assert (target / "data" / "uni" / "fictional.pdf").read_bytes() == document.read_bytes()
    assert (target / "data" / "uni" / "linked.pdf").read_bytes() == document.read_bytes()
    assert not (target / "local" / "sessions.json").exists()
    assert (target / "local" / "addon-modules" / module_name).read_bytes() == binary
    assert (target / "local" / "campus.json").read_bytes() == (settings.local_dir / "campus.json").read_bytes()
    assert (target / "local" / "timetable-selection-connection.json").read_bytes() == (
        settings.local_dir / "timetable-selection-connection.json").read_bytes()
    assert (target / "local" / "ai-provider.json").read_text() == '{"model":"fictional-model"}'
    imported = Settings(_env_file=None, data_dir=target / "data", local_dir=target / "local")
    assert ProviderRepository(imported).load_key() == "fictional-ai-key"
    host = HostCoordinator(Settings(data_dir=target / "data", local_dir=target / "local"))
    assert host.current().generation == generation + 1
    original = (target / "local" / "uni_os.sqlite3").read_bytes()
    with pytest.raises(ValueError, match="neuen Server"):
        import_package(target, package, key)
    assert (target / "local" / "uni_os.sqlite3").read_bytes() == original


@pytest.mark.parametrize("path", [r"uni\fixture.pdf", r"..\outside.pdf", r"C:\private.pdf"])
def test_portable_paths_accept_only_verified_relative_files(tmp_path, path):
    home = tmp_path / "home"
    (home / "local").mkdir(parents=True)
    (home / "data" / "uni").mkdir(parents=True)
    (home / "data" / "uni" / "fixture.pdf").write_bytes(b"fictional")
    with sqlite3.connect(home / "local" / "uni_os.sqlite3") as database:
        database.execute("CREATE TABLE resource_versions (id INTEGER PRIMARY KEY, relative_path TEXT)")
        database.execute("INSERT INTO resource_versions VALUES (1, ?)", (path,))
    if path == r"uni\fixture.pdf":
        assert portable_database_paths(home) == 1
        expected = "uni/fixture.pdf"
    else:
        with pytest.raises(ValueError, match="Dateiverweis"):
            portable_database_paths(home)
        expected = path
    with sqlite3.connect(home / "local" / "uni_os.sqlite3") as database:
        assert database.execute("SELECT relative_path FROM resource_versions").fetchone() == (expected,)


@pytest.mark.parametrize("damage", ["truncate", "tamper", "wrong-key"])
def test_transfer_rejects_incomplete_or_forged_stream(tmp_path, damage):
    key = os.urandom(32)
    path = tmp_path / "encrypted"
    with path.open("wb") as output:
        writer = EncryptedWriter(output, key)
        writer.write(b"fixture" * 200_000)
        writer.finish()
    raw = path.read_bytes()
    if damage == "truncate":
        path.write_bytes(raw[:-30])
    elif damage == "tamper":
        path.write_bytes(raw[:80] + bytes([raw[80] ^ 1]) + raw[81:])
    else:
        key = os.urandom(32)
    with path.open("rb") as incoming, pytest.raises((InvalidTag, ValueError)):
        reader = EncryptedReader(incoming, key)
        reader.verify_end()
