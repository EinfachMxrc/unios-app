# SPDX-License-Identifier: AGPL-3.0-or-later

"""The official Anki engine preserves scheduling and history across packages."""

import base64

from anki.collection import Collection
from fastapi.testclient import TestClient

from app.anki.collection import (
    add_approved_note,
    export_package,
    open_collection,
    write_study_mode,
)
from app.anki.study_api import _safe_html
from app.host.handoff import _install_snapshot, _stage_anki_snapshot, _stage_snapshot
from app.host.snapshots import create_snapshot, verify_snapshot
from app.main import create_app


def test_integrated_review_and_package_roundtrip(settings, factory, coordinator, tmp_path):
    with open_collection(settings) as col:
        note_id = add_approved_note(
            col, queue_id=17, card_type="basic", front="Frage?", back="Antwort.",
            course="Mathematik", topic="Analysis", semester="1", source_file="Skript.pdf",
            source_page=2,
        )
        assert add_approved_note(
            col, queue_id=17, card_type="basic", front="Frage?", back="Antwort.",
            course="Mathematik", topic="Analysis", semester="1", source_file="Skript.pdf",
            source_page=2,
        ) == note_id
    write_study_mode(settings, "integrated")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        due = client.get("/api/anki/study/due")
        assert due.status_code == 200, due.text
        card = due.json()["cards"][0]
        assert card["front"] == "Frage?"
        response = client.post("/api/anki/study/reviews", json={
            "card_id": card["id"], "rating": 3, "review_id": "test-review-1",
        })
        assert response.status_code == 200, response.text
        replay = client.post("/api/anki/study/reviews", json={
            "card_id": card["id"], "rating": 3, "review_id": "test-review-1",
        })
        assert replay.status_code == 200, replay.text
        assert replay.json()["already_applied"] is True
        status = client.get("/api/anki/study/status").json()
        assert status["cards"] == 1
        assert status["reviews"] == 1
        exported = client.post("/api/anki/study/export")
        assert exported.status_code == 200, exported.text
        package = client.get(f"/api/anki/study/packages/{exported.json()['package']}")
        assert package.status_code == 200
        target = tmp_path / "roundtrip.apkg"
        target.write_bytes(package.content)

    from app.anki.collection import import_package

    restored = Collection(str(tmp_path / "restored.anki2"))
    try:
        import_package(restored, target)
        assert len(restored.find_cards("")) == 1
        assert restored.db is not None
        assert restored.db.scalar("select count(*) from revlog") == 1
    finally:
        restored.close()

    manifest = create_snapshot(coordinator)
    folder = settings.data_dir / "host" / "snapshots"
    assert manifest.anki_filename is not None
    assert verify_snapshot(folder, manifest, check_integrity=True)
    receiver = settings.model_copy(update={"local_dir": tmp_path / "other-device"})
    stage = _stage_anki_snapshot(folder, manifest, receiver)
    assert stage is not None
    staged = Collection(str(stage))
    try:
        assert len(staged.find_cards("")) == 1
        assert staged.db is not None
        assert staged.db.scalar("select count(*) from revlog") == 1
    finally:
        staged.close()


def test_mode_switch_snapshots_and_transfers_review_history(settings, factory, coordinator, tmp_path):
    package = tmp_path / "desktop.apkg"
    desktop = Collection(str(tmp_path / "desktop.anki2"))
    try:
        image = tmp_path / "diagram.png"
        image.write_bytes(base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg=="))  # pragma: allowlist secret
        media_name = desktop.media.add_file(str(image))
        add_approved_note(desktop, queue_id=5, card_type="basic",
                          front=f'Was? <img src="{media_name}">', back="Das.",
                          course="Physik", topic="Mechanik", semester="2", source_file="Text.pdf",
                          source_page=1)
        card_id = desktop.find_cards("")[0]
        desktop.decks.select(desktop.get_card(card_id).did)
        card = desktop.sched.getCard()
        assert card is not None
        desktop.sched.answerCard(card, 3)
        export_package(desktop, package)
    finally:
        desktop.close()

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        preview = client.post("/api/anki/study/preview",
                              files={"package": ("desktop.apkg", package.read_bytes())})
        assert preview.status_code == 200, preview.text
        assert preview.json()["cards"] == 1 and preview.json()["reviews"] == 1
        started = client.post("/api/anki/study/switch/integrated",
                              files={"package": ("desktop.apkg", package.read_bytes())})
        assert started.status_code == 200, started.text
        assert started.json()["after"]["reviews"] == 1
        manifest = create_snapshot(coordinator)
        receiver = settings.model_copy(update={"local_dir": tmp_path / "handoff-device"})
        receiver.local_dir.mkdir()
        folder = settings.data_dir / "host" / "snapshots"
        target_db = receiver.local_dir / "uni_os.sqlite3"
        stage_db = _stage_snapshot(folder, manifest, target_db)
        stage_anki = _stage_anki_snapshot(folder, manifest, receiver)
        assert stage_anki is not None
        _install_snapshot(stage_db, target_db, stage_anki,
                          receiver.local_dir / "anki" / "collection.anki2")
        assert (receiver.local_dir / "anki" / "collection.media" / media_name).is_file()
        switched = client.post("/api/anki/study/switch/external")
        assert switched.status_code == 200, switched.text
        exported = client.get(f"/api/anki/study/packages/{switched.json()['package']}")
        assert exported.status_code == 200
        assert client.get("/api/anki/study/status").json()["mode"] == "external"

    assert len(list((settings.data_dir / "host" / "snapshots").glob("*.sqlite3.json"))) == 3
    transfer = tmp_path / "transfer.apkg"
    transfer.write_bytes(exported.content)
    imported = Collection(str(tmp_path / "other-anki.anki2"))
    try:
        from app.anki.collection import import_package

        import_package(imported, transfer)
        assert len(imported.find_cards("")) == 1
        assert imported.db is not None
        assert imported.db.scalar("select count(*) from revlog") == 1
        assert (tmp_path / "other-anki.media" / media_name).is_file()
    finally:
        imported.close()


def test_imported_card_html_only_serves_local_media():
    safe = _safe_html('<script>alert(1)</script><img src="diagram.png" onerror="alert(2)">')
    assert "script" not in safe and "onerror" not in safe
    assert '/api/anki/study/media/diagram.png' in safe
    assert '<img' not in _safe_html('<img src="https://example.invalid/track">')
    assert '<img' not in _safe_html('<img src="active.svg">')
