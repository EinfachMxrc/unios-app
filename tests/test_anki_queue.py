# SPDX-License-Identifier: AGPL-3.0-or-later

"""Card proposals need an explicit decision and a valid local source."""

import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.db.models import Course, MaterialAnnotation, Resource, ResourceVersion
from app.main import create_app


def test_card_queue_import_review_and_limit(settings, factory, coordinator):
    settings.max_anki_candidates_per_resource = 2
    settings.anki_agent_token = "fixture-agent-token"
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren 1", short_name="Prog 1")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r1", course_id=course.id,
                            kind="file", name="Schleifen.pdf", url="https://example.invalid/file")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/Schleifen.pdf", size=10, mime_type="application/pdf",
                                  downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        question_id = "00000000-0000-4000-8000-000000000007"
        session.add(MaterialAnnotation(id=question_id, resource_id=resource.id,
                                       source_version_id=version.id, kind="question",
                                       quote="while und for", comment="Was ist anders?", source_page=1))
        session.commit()
        resource_id, course_id, version_id = resource.id, course.id, version.id

    journal = settings.data_dir / "annotations"
    journal.mkdir(parents=True)
    (journal / f"{resource_id}.jsonl").write_text(json.dumps({
        "action": "create", "id": question_id, "resource_id": resource_id,
        "source_version_id": version_id, "source": "fixture", "source_key": "r1",
        "source_version": 1, "kind": "question", "quote": "while und for",
        "comment": "Was ist anders?", "context_before": "", "context_after": "",
        "source_page": 1, "source_rects": [[0.1, 0.1, 0.2, 0.2]],
        "resolved": False, "revision": 1,
        "created_at": datetime.now(UTC).isoformat(), "updated_at": datetime.now(UTC).isoformat(),
    }) + "\n", encoding="utf-8")

    card = {"card_type": "basic", "front": "Was ist eine Schleife?", "back": "Eine Wiederholung.",
            "course": "falscher-kurs", "topic": "schleifen", "source_page": None,
            "source_question_id": question_id, "confidence": "high"}
    payload = {"schema_version": 1, "generated_by": "test", "generated_at": datetime.now(UTC).isoformat(),
               "source": {"resource_id": resource_id, "version": 1}, "cards": [card]}
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        invalid = {**payload, "cards": [{**card, "source_question_id":
                                      "00000000-0000-4000-8000-000000000099"}]}
        assert client.post("/api/anki/queue/import", json=invalid).status_code == 422
        wrong_page = {**payload, "cards": [{**card, "source_page": 2}]}
        assert client.post("/api/anki/queue/import", json=wrong_page).status_code == 422
        created = client.post("/api/anki/queue/import", json=payload)
        assert created.status_code == 201, created.text
        item = created.json()[0]
        assert item["card"]["course"] == "prog-1"
        assert item["card"]["source_question_id"] == question_id
        assert item["card"]["source_page"] == 1
        assert item["status"] == "proposed"
        material = client.get(f"/api/courses/{course_id}/material")
        assert material.status_code == 200
        assert material.json()["questions"][0]["linked_cards"] == 1
        assert client.get("/api/anki/queue").json()[0]["id"] == item["id"]

        edited = client.put(f"/api/anki/queue/{item['id']}", json={
            "status": "approved", "front": "Was ist eine while-Schleife?",
            "back": "Sie prüft vor jedem Durchlauf.", "topic": "kontrollfluss"})
        assert edited.status_code == 200, edited.text
        assert edited.json()["card"]["topic"] == "kontrollfluss"
        assert client.put(f"/api/anki/queue/{item['id']}", json={
            "status": "rejected", "front": "x", "back": "y", "topic": "z"}).status_code == 409

        second = client.post("/api/anki/queue/import", json=payload).json()[0]
        assert client.post("/api/anki/queue/approve", json={"ids": [second["id"]]}).json() == [second["id"]]
        assert client.get("/api/anki/queue").json()[0]["status"] == "approved"
        assert client.get("/api/anki/agent/approved").status_code == 403
        headers = {"X-Anki-Agent-Token": "fixture-agent-token"}
        approved = client.get("/api/anki/agent/approved", headers=headers)
        assert approved.status_code == 200 and len(approved.json()) == 2
        ack = {"queue_id": second["id"], "note_id": 123456}
        assert client.post("/api/anki/agent/pushed", json=ack, headers=headers).json() == {"status": "pushed"}
        assert client.post("/api/anki/agent/pushed", json=ack, headers=headers).json() == {"status": "pushed"}
        assert client.get("/api/anki/agent/notes", headers=headers).json() == [{"note_id": 123456}]
        review = {"reviews": [{"note_id": 123456, "review_id": 1750000000000, "rating": 3}]}
        assert client.post("/api/anki/agent/reviews", json=review, headers=headers).json() == {"imported": 1}
        assert client.post("/api/anki/agent/reviews", json=review, headers=headers).json() == {"imported": 0}
        assert client.post("/api/anki/agent/reviews", json={"reviews": [
            {"note_id": 999, "review_id": 1750000000001, "rating": 3}]}, headers=headers).status_code == 404
        assert len(client.get("/api/anki/agent/approved", headers=headers).json()) == 1
        assert client.post("/api/anki/queue/import", json={**payload, "cards": [card, card]}).status_code == 422
        assert client.post("/api/anki/queue/import", json={**payload, "cards": [
            {**card, "card_type": "cloze"}]}).status_code == 422
        assert client.post("/api/anki/queue/import", json={**payload,
                           "source": {"resource_id": resource_id, "version": 99}}).status_code == 404
        with factory() as session:
            resource = session.get(Resource, resource_id)
            resource.group_category = "other_group"
            session.commit()
        assert client.post("/api/anki/queue/import", json=payload).status_code == 404
