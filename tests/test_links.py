# SPDX-License-Identifier: AGPL-3.0-or-later

"""Generic links work in both directions and accept only existing objects."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import Course, Jot, LearningTopic, LinkEdge, Note, Resource
from app.main import create_app


def seed(factory):
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Algebra")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r1", course_id=course.id,
                            kind="file", name="Übungsblatt 1", url="https://example.invalid/file")
        jot = Jot(id=str(uuid4()), kind="question", body="Warum gilt diese Gleichung?",
                  created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        note = Note(id=str(uuid4()), course_id=course.id, title="Alte Notiz", current_revision=1)
        session.add_all([resource, jot, note])
        session.commit()
        return course.id, resource.id, jot.id, note.id


def test_links_search_reverse_duplicate_and_remove(settings, factory, coordinator):
    course_id, resource_id, jot_id, note_id = seed(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    course = {"from_type": "course", "from_id": str(course_id)}
    jot = {"to_type": "jot", "to_id": jot_id}
    with TestClient(app) as client:
        candidates = client.get("/api/links/candidates", params={"q": "Gleichung"})
        assert candidates.status_code == 200
        assert candidates.json()[0]["id"] == jot_id
        first = client.post("/api/links", json={**course, **jot})
        assert first.status_code == 200, first.text
        edge_id = first.json()["id"]
        reverse = client.post("/api/links", json={"from_type": "jot", "from_id": jot_id,
                                                   "to_type": "course", "to_id": str(course_id)})
        assert reverse.status_code == 200
        assert reverse.json()["id"] == edge_id
        assert client.get(f"/api/links/course/{course_id}").json()[0]["target"]["id"] == jot_id
        assert client.get(f"/api/links/jot/{jot_id}").json()[0]["target"]["id"] == str(course_id)
        assert client.post("/api/links", json={**course, "to_type": "resource",
                                                "to_id": str(resource_id)}).status_code == 200
        assert client.post("/api/links", json={**course, "to_type": "note", "to_id": note_id}).status_code == 200
        assert len(client.get(f"/api/links/course/{course_id}").json()) == 3
        assert client.delete(f"/api/links/{edge_id}").status_code == 204
        assert len(client.get(f"/api/links/jot/{jot_id}").json()) == 0
    with factory() as session:
        assert len(session.scalars(select(LinkEdge)).all()) == 2


def test_links_reject_invalid_targets_self_links_and_cross_site(settings, factory, coordinator):
    course_id, _, _, _ = seed(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    payload = {"from_type": "course", "from_id": str(course_id),
               "to_type": "course", "to_id": str(course_id)}
    with TestClient(app) as client:
        assert client.post("/api/links", json=payload).status_code == 422
        assert client.post("/api/links", json={**payload, "to_id": "999"}).status_code == 404
        assert client.post("/api/links", json={**payload, "to_type": "project"}).status_code == 404
        assert client.post("/api/links", json={**payload, "to_id": "999",
                                               "relation": "unknown"}).status_code == 422
        assert client.post("/api/links", json=payload,
                           headers={"origin": "https://example.invalid"}).status_code == 403
        assert client.get("/api/links/course/999").status_code == 404


def test_semantic_links_keep_direction_and_find_topics(settings, factory, coordinator):
    course_id, resource_id, _, _ = seed(factory)
    with factory() as session:
        first = LearningTopic(course_id=course_id, slug="rekursion", name="Rekursion")
        second = LearningTopic(course_id=course_id, slug="bäume", name="Bäume")
        session.add_all([first, second])
        session.commit()
        first_id, second_id = first.id, second.id

    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        found = client.get("/api/links/candidates", params={"q": "Rekursion"}).json()
        assert any(item["type"] == "topic" and item["id"] == str(first_id) for item in found)
        prerequisite = client.post("/api/links", json={
            "from_type": "topic", "from_id": str(first_id),
            "to_type": "topic", "to_id": str(second_id), "relation": "prerequisite"})
        assert prerequisite.status_code == 200
        outgoing = client.get(f"/api/links/topic/{first_id}").json()[0]
        incoming = client.get(f"/api/links/topic/{second_id}").json()[0]
        assert (outgoing["label"], outgoing["direction"]) == ("Voraussetzung für", "outgoing")
        assert (incoming["label"], incoming["direction"]) == ("setzt voraus", "incoming")
        cycle = client.post("/api/links", json={
            "from_type": "topic", "from_id": str(second_id),
            "to_type": "topic", "to_id": str(first_id), "relation": "prerequisite"})
        assert cycle.status_code == 422
        assert "Kreis" in cycle.json()["detail"]
        explains = client.post("/api/links", json={
            "from_type": "resource", "from_id": str(resource_id),
            "to_type": "topic", "to_id": str(first_id), "relation": "explains"})
        assert explains.status_code == 200
        assert any(item["label"] == "wird erklärt durch" for item in
                   client.get(f"/api/links/topic/{first_id}").json())
        part_of = client.post("/api/links", json={
            "from_type": "topic", "from_id": str(first_id),
            "to_type": "course", "to_id": str(course_id), "relation": "part_of"})
        assert part_of.status_code == 200
        assert any(item["label"] == "enthält" for item in
                   client.get(f"/api/links/course/{course_id}").json())
