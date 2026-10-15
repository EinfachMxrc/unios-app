# SPDX-License-Identifier: AGPL-3.0-or-later

"""The built-in backup: a folder of your choice, a daily copy, and a restore that can be undone."""

import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.backups import restore, run, store
from app.backups.store import BackupError, BackupSettings
from app.db.models import Course
from app.main import create_app


def seed(settings, factory) -> None:
    with factory() as session:
        session.add(Course(source="fixture", source_id="1", name="Mathematik"))
        session.commit()
    (settings.data_dir / "notes" / "Mathematik_1").mkdir(parents=True)
    (settings.data_dir / "notes" / "Mathematik_1" / "v0001.md").write_text("Eigenwerte", encoding="utf-8")
    (settings.data_dir / "host" / "snapshots").mkdir(parents=True)
    (settings.data_dir / "host" / "snapshots" / "old.sqlite3").write_bytes(b"device only")
    (settings.local_dir / "setup.json").write_text('{"completed": true}', encoding="utf-8")
    (settings.local_dir / "sessions.json").write_text('{"token": "secret"}', encoding="utf-8")


def configure(settings, tmp_path, keep: int = 14):
    return store.save_settings(settings, BackupSettings(folder=str(tmp_path / "usb"), daily=True, keep=keep))


def test_a_backup_copies_the_database_files_and_settings_but_no_secrets(settings, factory, coordinator, tmp_path):
    seed(settings, factory)
    configure(settings, tmp_path)
    status = run.run_backup(settings, coordinator, "1.2.3", now=datetime(2026, 10, 13, 9, 30, tzinfo=UTC))
    assert status["status"] == "success"
    root = tmp_path / "usb" / "UniOS-Backup"
    snapshot = root / "snapshots" / "UniOS-2026-10-13_093000"
    manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["app_version"] == "1.2.3" and manifest["schema"] and manifest["files"] == 1
    with sqlite3.connect(snapshot / "uni_os.sqlite3") as copy:
        assert copy.execute("SELECT name FROM courses").fetchone() == ("Mathematik",)
    assert (root / "files" / "notes" / "Mathematik_1" / "v0001.md").read_text(encoding="utf-8") == "Eigenwerte"
    assert not (root / "files" / "host").exists()
    assert (snapshot / "local" / "setup.json").is_file()
    assert not (snapshot / "local" / "sessions.json").exists()
    assert [item["name"] for item in store.list_snapshots(str(tmp_path / "usb"))] == [snapshot.name]


def test_old_backups_are_pruned_and_daily_runs_catch_up(settings, factory, coordinator, tmp_path):
    seed(settings, factory)
    configure(settings, tmp_path, keep=2)
    start = datetime(2026, 10, 10, 8, 0, tzinfo=UTC)
    for day in range(3):
        run.run_backup(settings, coordinator, now=start + timedelta(days=day))
    names = [item["name"] for item in store.list_snapshots(str(tmp_path / "usb"))]
    assert names == ["UniOS-2026-10-12_080000", "UniOS-2026-10-11_080000"]
    assert not run.due_for_daily_backup(settings, now=start + timedelta(days=2, hours=23))
    assert run.due_for_daily_backup(settings, now=start + timedelta(days=3, hours=1))


def test_the_folder_must_be_writable_and_outside_unios_storage(settings, coordinator, tmp_path):
    with pytest.raises(BackupError, match="vollständigen"):
        store.save_settings(settings, BackupSettings(folder="relativ/pfad"))
    with pytest.raises(BackupError, match="eigener Ablage"):
        store.save_settings(settings, BackupSettings(folder=str(settings.data_dir / "backups")))
    assert store.load_settings(settings).folder is None
    with pytest.raises(BackupError, match="Backup-Ordner wählen"):
        run.run_backup(settings, coordinator)


def test_restore_is_staged_then_applied_at_start_and_keeps_the_replaced_database(settings, factory, coordinator, tmp_path):
    seed(settings, factory)
    configure(settings, tmp_path)
    name = run.run_backup(settings, coordinator, now=datetime(2026, 10, 13, 9, 30, tzinfo=UTC))["name"]
    with factory() as session:
        session.execute(text("UPDATE courses SET name = 'Später geändert'"))
        session.commit()
    (settings.data_dir / "notes" / "Mathematik_1" / "v0001.md").unlink()

    with pytest.raises(BackupError, match="WIEDERHERSTELLEN"):
        restore.stage_restore(settings, name, "ja")
    with pytest.raises(BackupError, match="nicht gefunden"):
        restore.stage_restore(settings, "UniOS-1999-01-01_000000", "WIEDERHERSTELLEN")
    restore.stage_restore(settings, name, "wiederherstellen ".upper())
    assert restore.pending_restore(settings)["name"] == name

    database = settings.local_dir / "uni_os.sqlite3"
    factory.kw["bind"].dispose()
    result = restore.apply_pending_restore(settings, database)
    assert result is not None and result["status"] == "success"
    with sqlite3.connect(database) as restored:
        assert restored.execute("SELECT name FROM courses").fetchone() == ("Mathematik",)
    with sqlite3.connect(settings.local_dir / result["previous"] / "uni_os.sqlite3") as previous:
        assert previous.execute("SELECT name FROM courses").fetchone() == ("Später geändert",)
    assert (settings.data_dir / "notes" / "Mathematik_1" / "v0001.md").read_text(encoding="utf-8") == "Eigenwerte"
    assert restore.pending_restore(settings) is None
    assert restore.last_restore(settings)["status"] == "success"
    assert restore.apply_pending_restore(settings, database) is None


def test_a_backup_from_a_newer_unios_is_refused(settings, factory, coordinator, tmp_path):
    seed(settings, factory)
    configure(settings, tmp_path)
    name = run.run_backup(settings, coordinator)["name"]
    manifest = tmp_path / "usb" / "UniOS-Backup" / "snapshots" / name / "manifest.json"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    manifest.write_text(json.dumps({**data, "schema": "ffffffffffff"}), encoding="utf-8")
    with pytest.raises(BackupError, match="neueren UniOS-Version"):
        restore.stage_restore(settings, name, "WIEDERHERSTELLEN")


def test_backup_api(settings, factory, coordinator, tmp_path):
    seed(settings, factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        initial = client.get("/api/backup").json()
        assert initial["folder"] is None and initial["snapshots"] == [] and initial["confirmation"] == "WIEDERHERSTELLEN"
        assert client.post("/api/backup/run").status_code == 409
        refused = client.put("/api/backup/settings", json={"folder": str(settings.local_dir / "x"), "daily": True, "keep": 7})
        assert refused.status_code == 400
        chosen = client.put("/api/backup/settings", json={"folder": str(tmp_path / "usb"), "daily": False, "keep": 7})
        assert chosen.json()["keep"] == 7 and chosen.json()["daily"] is False
        ran = client.post("/api/backup/run").json()
        assert ran["status"]["status"] == "success" and len(ran["snapshots"]) == 1
        staged = client.post("/api/backup/restore", json={"name": ran["snapshots"][0]["name"], "confirmation": "WIEDERHERSTELLEN"})
        assert staged.json()["pending_restore"] == ran["snapshots"][0]["name"]
        assert client.delete("/api/backup/restore").json()["pending_restore"] is None
        assert client.put("/api/backup/settings", headers={"origin": "https://example.invalid"},
                          json={"folder": str(tmp_path / "x")}).status_code == 403


def test_the_builtin_anki_collection_is_backed_up_and_restored(settings, factory, coordinator, tmp_path):
    seed(settings, factory)
    anki = settings.local_dir / "anki"
    (anki / "collection.media").mkdir(parents=True)
    (anki / "collection.media" / "bild.png").write_bytes(b"png")
    # A real restore runs before Anki opens; transaction contexts alone keep Windows handles open.
    with closing(sqlite3.connect(anki / "collection.anki2")) as collection, collection:
        collection.execute("CREATE TABLE notes (flds TEXT)")
        collection.execute("INSERT INTO notes VALUES ('Karte vor dem Backup')")
    configure(settings, tmp_path)
    name = run.run_backup(settings, coordinator, now=datetime(2026, 10, 13, 9, 30, tzinfo=UTC))["name"]
    with closing(sqlite3.connect(anki / "collection.anki2")) as collection, collection:
        collection.execute("UPDATE notes SET flds = 'Später geändert'")

    restore.stage_restore(settings, name, "WIEDERHERSTELLEN")
    factory.kw["bind"].dispose()
    result = restore.apply_pending_restore(settings, settings.local_dir / "uni_os.sqlite3")

    assert result is not None and result["status"] == "success"
    with closing(sqlite3.connect(anki / "collection.anki2")) as collection:
        assert collection.execute("SELECT flds FROM notes").fetchone() == ("Karte vor dem Backup",)
    assert (anki / "collection.media" / "bild.png").read_bytes() == b"png"
    with closing(sqlite3.connect(settings.local_dir / result["previous"] / "anki" / "collection.anki2")) as previous:
        assert previous.execute("SELECT flds FROM notes").fetchone() == ("Später geändert",)
