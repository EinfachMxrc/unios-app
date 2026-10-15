# SPDX-License-Identifier: AGPL-3.0-or-later

"""Markings survive PDF versions without changing the source document."""

import hashlib
import json
import sys
from types import SimpleNamespace
from uuid import uuid4

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.db.models import Course, MaterialAnnotation, Resource, ResourceVersion
from app.host.snapshots import SnapshotVerificationError, create_snapshot
from app.main import create_app
from app.material.events import rebuild_annotation_index
from app.material.migrate import migrate_legacy_annotations
from app.material.service import anchor


def test_reader_waits_for_journal_append_and_database_commit(settings, factory, monkeypatch):
    import threading
    from concurrent.futures import ThreadPoolExecutor

    from app.material import service

    _, version_id, _ = prepare(settings, factory, ['Synthetic passage'])
    with factory() as session:
        version = session.get(ResourceVersion, version_id)
        item = service.create(session, settings.data_dir, version, 'question', 'Synthetic passage', 1, 'Question')
        identifier = item.id
    appended, release = threading.Event(), threading.Event()
    original = service._append_event
    def paused(*args):
        original(*args)
        appended.set()
        assert release.wait(3)
    monkeypatch.setattr(service, '_append_event', paused)
    def writer():
        with factory() as session:
            service.update(session, settings.data_dir, session.get(MaterialAnnotation, identifier),
                           comment='Question', resolved=True, expected_revision=1)
    def reader():
        with factory() as session:
            return service.current_event(session, settings.data_dir, session.get(MaterialAnnotation, identifier))
    with ThreadPoolExecutor(max_workers=2) as pool:
        writing = pool.submit(writer)
        assert appended.wait(3)
        reading = pool.submit(reader)
        try:
            assert not reading.done()
        finally:
            release.set()
        writing.result(timeout=3)
        assert reading.result(timeout=3)['resolved'] is True


def pdf_bytes(lines: list[str]) -> bytes:
    pdf = pymupdf.open()
    for line in lines:
        page = pdf.new_page()
        page.insert_text((70, 90), line)
    result = pdf.tobytes()
    pdf.close()
    return result


def prepare(settings, factory, lines: list[str]) -> tuple[int, int, bytes]:
    content = pdf_bytes(lines)
    with factory() as session:
        course = Course(source="moodle", source_id="material", name="Fiktive Informatik")
        session.add(course)
        session.flush()
        resource = Resource(source="moodle", source_key="material-pdf", course_id=course.id,
                            kind="file", name="Skript.pdf", url="", group_category="general")
        session.add(resource)
        session.flush()
        path = settings.data_dir / "uni" / "Skript-v1.pdf"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        version = ResourceVersion(resource_id=resource.id, version=1, sha256=hashlib.sha256(content).hexdigest(),
                                  relative_path="uni/Skript-v1.pdf", size=len(content), mime_type="application/pdf")
        session.add(version)
        session.commit()
        return resource.id, version.id, content


def add_version(settings, factory, resource_id: int, number: int, lines: list[str]) -> int:
    content = pdf_bytes(lines)
    path = settings.data_dir / "uni" / f"Skript-v{number}.pdf"
    path.write_bytes(content)
    with factory() as session:
        item = ResourceVersion(resource_id=resource_id, version=number, sha256=hashlib.sha256(content).hexdigest(),
                               relative_path=f"uni/Skript-v{number}.pdf", size=len(content), mime_type="application/pdf")
        session.add(item)
        session.commit()
        return item.id


def test_pdf_annotations_remap_and_export(settings, factory, coordinator):
    resource_id, first_id, original = prepare(settings, factory, ["Schleifen und Python Beispiele", "Rekursionstiefe"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        material = client.get(f"/api/material/{first_id}")
        assert material.status_code == 200
        assert material.json()["resource_name"] == "Skript.pdf"
        inline = client.get(f"/files/{first_id}/inline")
        assert inline.status_code == 200 and inline.content == original
        assert "inline" in inline.headers["content-disposition"]

        chosen_id = str(uuid4())
        payload = {
            "id": chosen_id,
            "kind": "question", "quote": "Schleifen und Python Beispiele", "page": 1,
            "comment": "Warum endet die Schleife?"}
        created = client.post(f"/api/material/{first_id}/annotations", json=payload)
        assert created.status_code == 200, created.text
        item = created.json()
        assert item["id"] == chosen_id
        assert client.post(f"/api/material/{first_id}/annotations", json=payload).json()["id"] == chosen_id
        assert item["anchor"]["status"] == "matched"
        assert item["anchor"]["page"] == 1
        assert item["anchor"]["rects"]
        events = settings.data_dir / "annotations" / f"{resource_id}.jsonl"
        assert [json.loads(line)["action"] for line in events.read_text(encoding="utf-8").splitlines()] == ["create"]
        with factory() as session:
            course_id = session.get(Resource, resource_id).course_id
        course_material = client.get(f"/api/courses/{course_id}/material").json()
        assert course_material["questions"][0]["quote"] == "Schleifen und Python Beispiele"
        learning = client.get("/api/learning/questions")
        assert learning.status_code == 200
        assert learning.json()["questions"][0]["id"] == chosen_id
        assert learning.json()["questions"][0]["source_page"] == 1
        saved = client.put(f"/api/courses/{course_id}/material/scratchpad", json={
            "expected_revision": 0, "body": "Tutorium am Donnerstag"})
        assert saved.status_code == 200 and saved.json()["scratchpad_revision"] == 1
        notes = list((settings.data_dir / "notes").glob(f"{course_id}_*.v0001.md"))
        assert len(notes) == 1 and notes[0].read_text() == "Tutorium am Donnerstag\n"
        assert client.put(f"/api/courses/{course_id}/material/scratchpad", json={
            "expected_revision": 0, "body": "Konflikt"}).status_code == 409
        revised = client.put(f"/api/courses/{course_id}/material/scratchpad", json={
            "expected_revision": 1, "body": "Tutorium am Freitag"})
        assert revised.status_code == 200 and revised.json()["scratchpad_revision"] == 2
        assert notes[0].read_text() == "Tutorium am Donnerstag\n"
        assert len(list((settings.data_dir / "notes").glob(f"{course_id}_*.v0002.md"))) == 1

        second_id = add_version(settings, factory, resource_id, 2,
                                ["Einleitung", "Schleifen und Python Beispiele"])
        moved = client.get(f"/api/material/{second_id}").json()["annotations"][0]
        assert moved["anchor"]["status"] == "matched" and moved["anchor"]["page"] == 2
        exported = client.get(f"/api/material/{second_id}/export")
        assert exported.status_code == 200
        with pymupdf.open(stream=exported.content, filetype="pdf") as pdf:
            assert list(pdf[1].annots())
        assert (settings.data_dir / "uni" / "Skript-v1.pdf").read_bytes() == original

        updated = client.patch(f"/api/material/annotations/{item['id']}", json={
            "expected_revision": 1, "comment": "Im Tutorium geklärt", "resolved": True})
        assert updated.status_code == 200 and updated.json()["revision"] == 2
        recorded = [json.loads(line) for line in events.read_text(encoding="utf-8").splitlines()]
        assert [(event["action"], event["revision"]) for event in recorded] == [("create", 1), ("update", 2)]
        assert recorded[1]["comment"] == "Im Tutorium geklärt"
        with factory() as session:
            session.delete(session.get(MaterialAnnotation, item["id"]))
            session.commit()
        assert rebuild_annotation_index(factory, settings.data_dir)["created"] == 1
        with factory() as session:
            restored = session.get(MaterialAnnotation, item["id"])
            assert restored.revision == 2 and restored.comment == "Im Tutorium geklärt"
        assert client.patch(f"/api/material/annotations/{item['id']}", json={
            "expected_revision": 1, "comment": "Veraltet", "resolved": False}).status_code == 409

        missing_id = add_version(settings, factory, resource_id, 3, ["Ganz anderes Thema"])
        assert client.get(f"/api/material/{missing_id}").json()["annotations"][0]["anchor"]["status"] == "unmatched"
        ambiguous_id = add_version(settings, factory, resource_id, 4,
                                   ["Schleifen und Python Beispiele", "Schleifen und Python Beispiele"])
        assert client.get(f"/api/material/{ambiguous_id}").json()["annotations"][0]["anchor"]["status"] == "ambiguous"
        new_rects = anchor(settings.data_dir / "uni" / "Skript-v3.pdf", "Ganz anderes Thema", 1)["rects"]
        reassigned = client.post(f"/api/material/{missing_id}/annotations/{item['id']}/reanchor", json={
            "expected_revision": 2, "quote": "Ganz anderes Thema", "page": 1, "rects": new_rects})
        assert reassigned.status_code == 200, reassigned.text
        assert reassigned.json()["anchor"]["status"] == "matched"
        old_view = client.get(f"/api/material/{first_id}").json()["annotations"][0]
        assert old_view["quote"] == "Schleifen und Python Beispiele"
        assert old_view["anchor"]["status"] == "matched"
        assert client.delete(f"/api/material/annotations/{item['id']}?expected_revision=1").status_code == 409
        assert client.delete(f"/api/material/annotations/{item['id']}?expected_revision=3").status_code == 204
        assert client.get(f"/api/material/{first_id}").json()["annotations"] == []
        assert [json.loads(line)["action"] for line in events.read_text(encoding="utf-8").splitlines()] == [
            "create", "update", "reanchor", "delete"]


def test_material_rejects_untrusted_text_and_path(settings, factory, coordinator):
    _, version_id, _ = prepare(settings, factory, ["Sicheres Material"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Anderer Text", "page": 1}).status_code == 400
        assert client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Sicheres Material", "page": 9}).status_code == 400
        assert client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Sicheres Material", "page": 1},
            headers={"origin": "https://example.invalid"}).status_code == 403
        assert client.get("/api/material/999999").status_code == 404


def test_missing_annotation_journal_never_falls_back_to_database_text(settings, factory, coordinator):
    resource_id, version_id, _ = prepare(settings, factory, ["Wichtige Stelle"])
    with factory() as session:
        course_id = session.get(Resource, resource_id).course_id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Wichtige Stelle", "page": 1,
            "comment": "Was bedeutet das?"})
        assert created.status_code == 200
        (settings.data_dir / "annotations" / f"{resource_id}.jsonl").unlink()
        assert client.get(f"/api/material/{version_id}").status_code == 409
        assert client.get(f"/api/courses/{course_id}/material").status_code == 409
        assert client.get("/api/learning/questions").status_code == 409
        assert client.get(f"/api/material/{version_id}/export").status_code == 409


def test_course_lists_marks_and_exports_only_open_questions(settings, factory, coordinator):
    resource_id, version_id, _ = prepare(settings, factory, ["Schleifen und Rekursion"])
    with factory() as session:
        course_id = session.get(Resource, resource_id).course_id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        highlight = client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "highlight", "quote": "Schleifen", "page": 1}).json()
        question = client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Rekursion", "page": 1,
            "comment": "Wie endet die Funktion?"}).json()
        course = client.get(f"/api/courses/{course_id}/material").json()
        assert {item["id"] for item in course["annotations"]} == {highlight["id"], question["id"]}
        assert len(course["questions"]) == 1
        learning = client.get("/api/learning/questions").json()["questions"]
        assert len(learning) == 1 and learning[0]["comment"] == "Wie endet die Funktion?"
        assert all(item["page"] == 1 for item in course["annotations"])
        exported = client.get(f"/api/courses/{course_id}/questions/export")
        assert exported.status_code == 200
        assert "Rekursion" in exported.text and "Schleifen" not in exported.text
        assert "Wie endet die Funktion?" in exported.text
        assert client.patch(f"/api/material/annotations/{question['id']}", json={
            "expected_revision": 1, "comment": "Geklärt", "resolved": True}).status_code == 200
        assert "Keine offenen Fragen." in client.get(f"/api/courses/{course_id}/questions/export").text
        assert client.get("/api/learning/questions").json()["questions"][0]["resolved"] is True


def test_text_context_picks_the_right_page_when_quote_repeats(settings, factory, coordinator):
    resource_id, first_id, _ = prepare(settings, factory, ["Einleitung Schleifen und Python Ende"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post(f"/api/material/{first_id}/annotations", json={
            "kind": "highlight", "quote": "Schleifen und Python", "page": 1})
        assert created.status_code == 200
        second_id = add_version(settings, factory, resource_id, 2, [
            "Anderes Thema Schleifen und Python ohne Kontext",
            "Einleitung Schleifen und Python Ende"])
        moved = client.get(f"/api/material/{second_id}").json()["annotations"][0]
        assert moved["anchor"]["status"] == "matched"
        assert moved["anchor"]["page"] == 2


def test_text_context_picks_the_right_occurrence_on_one_page(settings, factory, coordinator):
    resource_id, first_id, _ = prepare(settings, factory, ["links Schleifen rechts"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post(f"/api/material/{first_id}/annotations", json={
            "kind": "highlight", "quote": "Schleifen", "page": 1})
        assert created.status_code == 200
        second_id = add_version(settings, factory, resource_id, 2,
                                ["falsch Schleifen ende links Schleifen rechts"])
        moved = client.get(f"/api/material/{second_id}").json()["annotations"][0]["anchor"]
        assert moved["status"] == "matched"
        assert moved["page"] == 1
        assert len(moved["rects"]) == 1
        with pymupdf.open(settings.data_dir / "uni" / "Skript-v2.pdf") as pdf:
            second = pdf[0].search_for("Schleifen")[1]
            expected_x0 = round(second.x0 / pdf[0].rect.width, 5)
        assert moved["rects"][0][0] == expected_x0


def test_legacy_marks_need_verified_snapshot_and_migrate_once(settings, factory, coordinator):
    resource_id, version_id, _ = prepare(settings, factory, ["Alte Markierung im Skript"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Alte Markierung", "page": 1,
            "comment": "Noch offen"}).json()
        changed = client.patch(f"/api/material/annotations/{created['id']}", json={
            "expected_revision": 1, "comment": "Jetzt verstanden", "resolved": True}).json()
    journal = settings.data_dir / "annotations" / f"{resource_id}.jsonl"
    old_dir = settings.data_dir / "annotations" / str(resource_id) / created["id"]
    old_dir.mkdir(parents=True)
    for event in (json.loads(line) for line in journal.read_text(encoding="utf-8").splitlines()):
        legacy = {key: value for key, value in event.items()
                  if key not in {"action", "source", "source_key", "source_version"}}
        (old_dir / f"{event['revision']:04d}.json").write_text(json.dumps(legacy))
    journal.unlink()
    with pytest.raises(ValueError, match="Markierungsprotokoll fehlt"):
        rebuild_annotation_index(factory, settings.data_dir)
    with TestClient(app) as client:
        assert client.patch(f"/api/material/annotations/{created['id']}", json={
            "expected_revision": 2, "comment": "Darf noch nicht", "resolved": False}).status_code == 409
    lease = coordinator.current()
    assert lease is not None
    with pytest.raises(SnapshotVerificationError):
        migrate_legacy_annotations(factory, settings.data_dir,
                                   generation=lease.generation, device_id=lease.device_id)
    create_snapshot(coordinator)
    result = migrate_legacy_annotations(factory, settings.data_dir,
                                        generation=lease.generation, device_id=lease.device_id)
    assert result == {"annotations_migrated": 1, "events_written": 2}
    assert migrate_legacy_annotations(factory, settings.data_dir,
                                      generation=lease.generation, device_id=lease.device_id)["events_written"] == 0
    with factory() as session:
        session.delete(session.get(MaterialAnnotation, created["id"]))
        session.commit()
    assert rebuild_annotation_index(factory, settings.data_dir)["created"] == 1
    with factory() as session:
        restored = session.get(MaterialAnnotation, created["id"])
        assert restored.revision == changed["revision"]
        assert restored.comment == "Jetzt verstanden"


def test_rebuild_refuses_to_downgrade_a_newer_annotation_index(settings, factory, coordinator):
    resource_id, version_id, _ = prepare(settings, factory, ["Ein eindeutiger Text"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "highlight", "quote": "eindeutiger Text", "page": 1}).json()
        changed = client.patch(f"/api/material/annotations/{created['id']}", json={
            "expected_revision": 1, "comment": "Neue Information", "resolved": False})
        assert changed.status_code == 200
    journal = settings.data_dir / "annotations" / f"{resource_id}.jsonl"
    first_event = journal.read_text(encoding="utf-8").splitlines()[0]
    journal.write_text(first_event + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="älter als der Datenbankindex"):
        rebuild_annotation_index(factory, settings.data_dir)
    with factory() as session:
        item = session.get(MaterialAnnotation, created["id"])
        assert item.revision == 2 and item.comment == "Neue Information"


def test_pptx_view_uses_derived_pdf_and_keeps_source(settings, factory, coordinator, monkeypatch):
    resource_id, _, _ = prepare(settings, factory, ["Platzhalter"])
    original = b"invented pptx source bytes"
    source = settings.data_dir / "uni" / "Folien.pptx"
    source.write_bytes(original)
    with factory() as session:
        version = ResourceVersion(resource_id=resource_id, version=2,
                                  sha256=hashlib.sha256(original).hexdigest(),
                                  relative_path="uni/Folien.pptx", size=len(original),
                                  mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation")
        session.add(version)
        session.commit()
        version_id = version.id
    expected = pdf_bytes(["Folie mit Text"])
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command)
        (kwargs["cwd"] / "Folien.pdf").write_bytes(expected)
        return SimpleNamespace(returncode=0)

    monkeypatch.setenv("LIBREOFFICE_BIN", sys.executable)
    monkeypatch.setattr("app.material.preview.subprocess.run", fake_run)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get(f"/api/material/{version_id}").status_code == 200
        assert client.get(f"/files/{version_id}/inline").content == expected
        assert client.get(f"/api/material/{version_id}").status_code == 200
        assert len(calls) == 1
        assert "--headless" in calls[0] and "--convert-to" in calls[0]
        assert "pdf:impress_pdf_Export" in calls[0]
        assert client.get(f"/files/{version_id}").content == original
        assert source.read_bytes() == original


def test_word_view_uses_writer_conversion_and_keeps_source(settings, factory, coordinator, monkeypatch):
    resource_id, _, _ = prepare(settings, factory, ["Platzhalter"])
    original = b"invented docx source bytes"
    source = settings.data_dir / "uni" / "Skript.docx"
    source.write_bytes(original)
    with factory() as session:
        version = ResourceVersion(resource_id=resource_id, version=2,
                                  sha256=hashlib.sha256(original).hexdigest(),
                                  relative_path="uni/Skript.docx", size=len(original),
                                  mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        session.add(version)
        session.commit()
        version_id = version.id
    expected = pdf_bytes(["Wortdokument mit Text"])
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command)
        (kwargs["cwd"] / "Skript.pdf").write_bytes(expected)
        return SimpleNamespace(returncode=0)

    monkeypatch.setenv("LIBREOFFICE_BIN", sys.executable)
    monkeypatch.setattr("app.material.preview.subprocess.run", fake_run)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get(f"/files/{version_id}/inline").content == expected
        assert "pdf:writer_pdf_Export" in calls[0]
        assert client.get(f"/files/{version_id}").content == original
        assert source.read_bytes() == original


def test_pptx_view_explains_missing_libreoffice(settings, factory, coordinator, monkeypatch):
    resource_id, _, _ = prepare(settings, factory, ["Platzhalter"])
    content = b"invented pptx source bytes"
    path = settings.data_dir / "uni" / "OhneOffice.pptx"
    path.write_bytes(content)
    with factory() as session:
        version = ResourceVersion(resource_id=resource_id, version=2,
                                  sha256=hashlib.sha256(content).hexdigest(),
                                  relative_path="uni/OhneOffice.pptx", size=len(content),
                                  mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation")
        session.add(version)
        session.commit()
        version_id = version.id
    monkeypatch.setenv("LIBREOFFICE_BIN", "/missing/soffice")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        unavailable = client.get(f"/api/material/{version_id}")
        assert unavailable.status_code == 503
        assert "LibreOffice" in unavailable.json()["detail"]
        assert client.get(f"/files/{version_id}").content == content
