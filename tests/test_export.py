# SPDX-License-Identifier: AGPL-3.0-or-later

"""Personal-data export bundles the database and user files, never secrets."""

import hashlib
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from app.cli.main import cli
from app.export.api import export_router
from app.export.service import build_export


def _write(path: Path, content: bytes = b"content") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def _seed_user_data(settings) -> None:
    _write(settings.data_dir / "annotations" / "42.jsonl", b'{"action":"create"}\n')
    _write(settings.data_dir / "notes" / "note.md", b"# Notiz")
    _write(settings.data_dir / "ai" / "inbox" / "package.zip", b"ai-inbox")
    _write(settings.data_dir / "ai" / "outbox" / "processed" / "result.json", b"{}")
    _write(settings.data_dir / "drop" / "original.pdf", b"%PDF-original")
    _write(settings.data_dir / "submissions" / "7" / "attempt.pdf", b"submission")
    _write(settings.data_dir / "voice" / "memo.wav", b"RIFFvoice")
    _write(settings.data_dir / "note-media" / "sample.wav", b"RIFFnote")
    _write(settings.data_dir / "projects" / "mirrors" / "snapshots" / "manifest.json", b'{"repo":"x"}')


def _seed_secrets(settings) -> None:
    _write(settings.data_dir / "host" / "lease.json", b'{"device_id":"secret-device"}')
    _write(settings.data_dir / "host" / "lease.bak.json", b'{"device_id":"secret-device"}')
    _write(settings.local_dir / "sessions.json", b'{"tokens":["secret-token"]}')


def _client(settings) -> TestClient:
    app = FastAPI()
    app.include_router(export_router(settings))
    return TestClient(app)


def test_export_zip_contains_manifest_with_matching_hashes(settings, factory, coordinator):
    _seed_user_data(settings)
    response = _client(settings).get("/api/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        assert "manifest.json" in names
        assert "database/uni_os.sqlite3" in names
        assert "data/annotations/42.jsonl" in names
        assert "data/notes/note.md" in names
        assert "data/ai/inbox/package.zip" in names
        assert "data/ai/outbox/processed/result.json" in names
        assert "data/drop/original.pdf" in names
        assert "data/submissions/7/attempt.pdf" in names
        assert "data/voice/memo.wav" in names
        assert archive.read("data/note-media/sample.wav") == b"RIFFnote"
        assert "data/projects/mirrors/snapshots/manifest.json" in names
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["include_files"] is False
        assert manifest["app_version"]
        assert manifest["schema_head_revision"]
        assert manifest["exported_at"]
        by_path = {entry["path"]: entry for entry in manifest["files"]}
        assert set(by_path) == names - {"manifest.json"}
        for name in names - {"manifest.json"}:
            content = archive.read(name)
            assert hashlib.sha256(content).hexdigest() == by_path[name]["sha256"]
            assert len(content) == by_path[name]["size"]


def test_export_excludes_secrets_regardless_of_include_files(settings, factory, coordinator):
    _seed_user_data(settings)
    _seed_secrets(settings)
    for include_files in (False, True):
        response = _client(settings).get("/api/export", params={"include_files": include_files})
        assert response.status_code == 200
        with ZipFile(BytesIO(response.content)) as archive:
            for name in archive.namelist():
                assert "lease" not in name
                assert "sessions.json" not in name
                assert ".env" not in name
            content = b"".join(archive.read(name) for name in archive.namelist())
            assert b"secret-device" not in content
            assert b"secret-token" not in content


def test_export_include_files_toggles_uni_material(settings, factory, coordinator):
    _write(settings.data_dir / "uni" / "Semester_1" / "Kurs" / "Material.pdf", b"%PDF-material")
    client = _client(settings)
    without = ZipFile(BytesIO(client.get("/api/export").content))
    assert not any(name.startswith("data/uni/") for name in without.namelist())
    manifest_without = json.loads(without.read("manifest.json"))
    assert manifest_without["include_files"] is False

    with_files = ZipFile(BytesIO(client.get("/api/export", params={"include_files": True}).content))
    names = with_files.namelist()
    assert "data/uni/Semester_1/Kurs/Material.pdf" in names
    assert with_files.read("data/uni/Semester_1/Kurs/Material.pdf") == b"%PDF-material"
    manifest_with = json.loads(with_files.read("manifest.json"))
    assert manifest_with["include_files"] is True


def test_export_fails_closed_without_a_database_file(settings, coordinator):
    # No ``factory`` fixture here, so the SQLite file backing ``database_url``
    # was never created -- the export must refuse rather than ship an empty
    # or missing database.
    response = _client(settings).get("/api/export")
    assert response.status_code == 409


def test_cli_export_writes_zip_and_refuses_to_overwrite(monkeypatch, tmp_path, settings, factory, coordinator):
    _seed_user_data(settings)
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    output = tmp_path / "export.zip"
    runner = CliRunner()
    result = runner.invoke(cli, ["export", "--output", str(output)])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["output"] == str(output)
    assert payload["include_files"] is False
    with ZipFile(output) as archive:
        assert "manifest.json" in archive.namelist()
        assert "data/annotations/42.jsonl" in archive.namelist()

    again = runner.invoke(cli, ["export", "--output", str(output)])
    assert again.exit_code != 0
    assert "existiert bereits" in again.output


def test_build_export_rejects_in_memory_database(tmp_path, settings):
    settings.database_url = "sqlite:///:memory:"
    try:
        build_export(settings, tmp_path / "export.zip", include_files=False)
    except ValueError as exc:
        assert "SQLite" in str(exc)
    else:
        raise AssertionError("Export mit :memory:-Datenbank hätte fehlschlagen müssen")
