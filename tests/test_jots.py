# SPDX-License-Identifier: AGPL-3.0-or-later

"""Quick captures survive retries and can be classified later."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db.models import Course, Jot
from app.main import create_app
from app.notes.store import create_note


def prepare(factory):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE jots_fts USING fts5(jot_id UNINDEXED, body)"))
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        session.execute(text("CREATE VIRTUAL TABLE resource_texts_fts USING fts5(text, content='resource_texts', content_rowid='id')"))
        course = Course(source="moodle", source_id="1", name="Mathematik")
        session.add(course)
        session.commit()
        return course.id


def test_jot_retry_assignment_and_search(settings, factory, coordinator):
    course_id = prepare(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    jot_id = str(uuid4())
    payload = {"id": jot_id, "kind": "question", "body": "Was bedeutet Eigenvektor?",
               "created_at": datetime.now(UTC).isoformat()}
    with TestClient(app) as client:
        first = client.post("/api/jots", json=payload)
        assert first.status_code == 200, first.text
        assert first.json()["course_id"] is None
        assert client.post("/api/jots", json=payload).status_code == 200
        assert client.post("/api/jots", json={**payload, "body": "Anderer Text"}).status_code == 409
        assert client.get("/api/search", params={"q": "Eigenvektor"}).json()["jot_results"][0]["id"] == jot_id
        assert client.get("/api/search", params={"q": "Eigenvektor", "course_id": course_id}).json()["jot_results"] == []
        assert client.patch(f"/api/jots/{jot_id}/assignment", json={"course_id": course_id}).status_code == 200
        assert client.get("/api/search", params={"q": "Eigenvektor", "course_id": course_id}).json()["jot_results"][0]["id"] == jot_id
        assert client.get("/api/jots", params={"course_id": course_id}).json()["jots"][0]["id"] == jot_id
        with factory() as session:
            note_id = create_note(session, settings, course_id=course_id, resource_id=None,
                                  title="Lineare Algebra", body="Test").id
        linked = client.patch(f"/api/jots/{jot_id}/assignment", json={"note_id": note_id})
        assert linked.json()["note_id"] == note_id
        assert linked.json()["course_id"] == course_id
        assert client.patch(f"/api/jots/{jot_id}/assignment", json={"course_id": 999, "note_id": note_id}).status_code == 400
        assert client.patch(f"/api/jots/{jot_id}/assignment", json={"course_id": 999}).status_code == 404
        assert client.patch(f"/api/jots/{uuid4()}/assignment", json={}).status_code == 404
    with factory() as session:
        assert len(session.scalars(select(Jot)).all()) == 1


def test_jot_validation_and_cross_site(settings, factory, coordinator):
    prepare(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    payload = {"id": str(uuid4()), "kind": "thought", "body": "Gedanke",
               "created_at": datetime.now(UTC).isoformat()}
    with TestClient(app) as client:
        assert client.post("/api/jots", headers={"origin": "https://example.invalid"}, json=payload).status_code == 403
        assert client.post("/api/jots", json={**payload, "kind": "invalid"}).status_code == 400
        assert client.post("/api/jots", json={**payload, "id": "not-a-uuid"}).status_code == 400
        assert client.post("/api/jots", json={**payload, "body": "   "}).status_code == 400
