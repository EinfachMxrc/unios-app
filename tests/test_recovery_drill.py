# SPDX-License-Identifier: AGPL-3.0-or-later

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from zipfile import ZipFile

import pytest
from anki.collection import Collection
from cryptography.fernet import Fernet
from sqlalchemy import text

from app.anki.collection import add_approved_note, open_collection, write_study_mode
from app.collections.cards import due_cards
from app.db.models import (
    Course,
    LinkEdge,
    MaterialAnnotation,
    Resource,
    ResourceVersion,
)
from app.export.service import build_export
from app.files.localpath import native_path
from app.notes.store import create_note
from app.server.migration import export, import_package
from tests.test_server_client import secure_keyring  # noqa: F401 - fictional vault only


@pytest.mark.usefixtures("secure_keyring")
def test_complete_portable_export_and_encrypted_restore_drill(settings, factory, coordinator, tmp_path, monkeypatch):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        course = Course(source="fixture", source_id="restore", name="Fiktive Informatik")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="restore-file", course_id=course.id, name="Skript", kind="file", url="")
        session.add(resource)
        session.flush()
        content = b"fictional original"
        path = settings.data_dir / "uni" / "script.txt"
        path.parent.mkdir(parents=True)
        path.write_bytes(content)
        version = ResourceVersion(resource_id=resource.id, version=1, relative_path="uni/script.txt",
                                  sha256=hashlib.sha256(content).hexdigest(), size=len(content), mime_type="text/plain")
        session.add(version)
        session.flush()
        session.add(MaterialAnnotation(id="fixture-question", resource_id=resource.id, source_version_id=version.id,
                                       kind="question", source_page=1, quote="Beispiel", comment="Warum?"))
        note = create_note(session, settings, course_id=course.id, resource_id=resource.id,
                           title="Eigene Notiz", body="# Verständnis\n\nMein Text.")
        session.add(LinkEdge(from_type="note", from_id=note.id, to_type="resource", to_id=str(resource.id), relation="explains"))
        session.commit()
        note_id = note.id
    with open_collection(settings) as collection:
        add_approved_note(collection, queue_id=31, card_type="basic", front="Fiktive Frage?", back="Eigene Antwort",
                          course="Fiktive Informatik", topic="Logik", semester="1", source_file="script.txt", source_page=1)
        collection.media.write_data("image.png", b"fictional media")
    write_study_mode(settings, "integrated")
    assert due_cards(settings)[0]["front"] == "Fiktive Frage?"
    (settings.local_dir / "connectors-enabled.json").write_text('{"fixture":true}', encoding="utf-8")
    portable = build_export(settings, tmp_path / "portable.zip", include_files=True)
    with ZipFile(portable) as archive:
        assert json.loads(archive.read("portable/courses.json"))[0]["name"] == "Fiktive Informatik"
        assert "Mein Text." in archive.read(f"portable/notes/{note_id}.md").decode("utf-8")
        assert json.loads(archive.read("portable/relationships.json"))[0]["relation"] == "explains"
        assert "Fiktive Frage?" in archive.read("portable/anki-notes.csv").decode("utf-8-sig")
        assert archive.read("anki/collection.media/image.png") == b"fictional media"
        assert archive.read("portable/calendar.ics").startswith(b"BEGIN:VCALENDAR")
    coordinator.close()
    key = os.urandom(32)
    package = tmp_path / "recovery.enc"
    export(settings, package, key)
    preview = tmp_path / "preview"
    with monkeypatch.context() as preview_patch:
        preview_patch.setattr("app.server.migration._import_credentials", lambda *args, **kwargs: pytest.fail("dry-run imported credentials"))
        assert import_package(preview, package, key, verify_only=True)["verified"]
    assert not native_path(preview / "local").exists()
    master = tmp_path / "restore.key"
    master.write_bytes(Fernet.generate_key())
    master.chmod(0o600)
    monkeypatch.setenv("UNIOS_SERVER_KEY", str(master))
    target = tmp_path / "restored"
    assert import_package(target, package, key)["verified"]
    with sqlite3.connect(target / "local" / "uni_os.sqlite3") as database:
        assert database.execute("SELECT title FROM notes").fetchone() == ("Eigene Notiz",)
        assert database.execute("SELECT comment FROM material_annotations").fetchone() == ("Warum?",)
        assert database.execute("SELECT relation FROM links").fetchone() == ("explains",)
    assert (target / "data" / "uni" / "script.txt").read_bytes() == content
    assert (target / "local" / "connectors-enabled.json").read_bytes() == (settings.local_dir / "connectors-enabled.json").read_bytes()
    restored = Collection(str(target / "local" / "anki" / "collection.anki2"))
    try:
        assert len(restored.find_cards("")) == 1
        assert (Path(restored.media.dir()) / "image.png").read_bytes() == b"fictional media"
    finally:
        restored.close()
