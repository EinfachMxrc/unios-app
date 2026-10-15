# SPDX-License-Identifier: AGPL-3.0-or-later

"""File imports keep originals and cannot create duplicate proposals on retry."""

import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.ai.outbox import process_outbox
from app.db.models import Course, Resource, ResourceVersion
from app.host.actions import ActionJournal
from app.main import create_app


def test_outbox_import_archive_and_retry(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r1", course_id=course.id,
                            kind="file", name="Schleifen.pdf", url="https://example.invalid/file")
        session.add(resource)
        session.flush()
        session.add(ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                    relative_path="uni/Schleifen.pdf", size=10, mime_type="application/pdf",
                                    downloaded_at=datetime.now(UTC)))
        session.commit()
        course_id, resource_id = course.id, resource.id

    outbox = settings.data_dir / "ai" / "outbox"
    outbox.mkdir(parents=True)
    payload = {"schema_version": 1, "generated_by": "fixture",
               "generated_at": datetime.now(UTC).isoformat(),
               "source": {"resource_id": resource_id, "version": 1},
               "cards": [{"card_type": "basic", "front": "Was ist eine Schleife?",
                          "back": "Eine Wiederholung.", "course": "prog1", "topic": "schleifen",
                          "source_page": 1, "confidence": "high"}]}
    raw = json.dumps(payload)
    (outbox / "vorschlag.json").write_text(raw, encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/ai/outbox/status").json() == {"pending": 1}
        first = client.post("/api/ai/outbox/process")
        assert first.status_code == 200, first.text
        assert first.json()["cards"] == 1
        assert len(client.get("/api/anki/queue").json()) == 1
        assert len(list((outbox / "processed").glob("*.json"))) == 1
        (outbox / "nochmal.json").write_text(raw, encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["duplicates"] == 1
        assert len(client.get("/api/anki/queue").json()) == 1
        (outbox / "fehler.json").write_text("{invalid", encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["rejected"] == 1
        assert len(list((outbox / "rejected").glob("*.json"))) == 1
        assert len(list((outbox / "rejected").glob("*.error.txt"))) == 1
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False}).status_code == 200
        blocked = {**payload, "generated_at": datetime.now(UTC).isoformat()}
        (outbox / "gesperrt.json").write_text(json.dumps(blocked), encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["rejected"] == 1
        assert len(client.get("/api/anki/queue").json()) == 1

    (outbox / "hintergrund.json").write_text("{invalid", encoding="utf-8")
    assert process_outbox(settings, factory, coordinator)["rejected"] == 1
    lease = coordinator.current()
    assert lease is not None
    actions, intact = ActionJournal(settings).actions_since(None, lease.device_id)
    assert intact
    assert [action["path"] for action in actions if action["path"] == "/internal/ai-outbox"] == [
        "/internal/ai-outbox"]
