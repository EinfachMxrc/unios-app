# SPDX-License-Identifier: AGPL-3.0-or-later

"""Saved views filter existing records without inventing learning percentages."""

import json
from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.collections.api import collections_router
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    Deadline,
    LearningTopic,
    Resource,
    ResourceVersion,
    utc_now,
)


def test_typed_views_follow_source_data_and_keep_revisions(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="course-1", name="Algorithmen")
        session.add(course)
        session.flush()
        weak = LearningTopic(course_id=course.id, slug="rekursion", name="Rekursion")
        unknown = LearningTopic(course_id=course.id, slug="graphen", name="Graphen")
        session.add_all([weak, unknown])
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=weak.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="fake-collection-card")
        session.add(card)
        session.flush()
        for rating in (1, 1, 1, 3, 3):
            session.add(AnkiReview(card_id=card.id, reviewed_at=utc_now(), rating=rating))
        resource = Resource(source="fixture", source_key="own-file", course_id=course.id,
                            kind="file", name="Algorithmen.pdf", url="", group_category="own_group")
        other = Resource(source="fixture", source_key="other-file", course_id=course.id,
                         kind="file", name="Fremde.pdf", url="", group_category="other_group")
        session.add_all([resource, other])
        session.flush()
        for item in (resource, other):
            session.add(ResourceVersion(resource_id=item.id, version=1, sha256="a" * 64,
                                        relative_path=f"{item.id}.pdf", size=1, mime_type="application/pdf"))
        session.add(Deadline(source="fixture", source_key="soon", course_id=course.id,
                             title="Übung abgeben", due_at=utc_now() + timedelta(days=2)))
        session.commit()
        course_id = course.id

    app = FastAPI()
    app.include_router(collections_router(settings, factory, coordinator))
    client = TestClient(app)
    config = {"kind": "topics", "view": "list", "course_id": course_id,
              "max_percent": 70, "include_unmeasured": False, "sort": "progress"}
    preview = client.get("/api/collections/preview", params=config)
    assert preview.status_code == 200
    assert [item["title"] for item in preview.json()["items"]] == ["Rekursion"]
    assert preview.json()["items"][0]["score"] == 40
    assert client.get("/api/collections/preview", params={**config, "include_unmeasured": True}).json()["total"] == 2
    assert client.get("/api/collections/preview", params={"kind": "materials", "own_group_only": True}).json()["items"][0]["title"] == "Algorithmen.pdf"
    assert client.get("/api/collections/preview", params={"kind": "topics", "view": "calendar"}).status_code == 422
    assert client.get("/api/collections/preview", params={"kind": "deadlines", "days": 7}).json()["total"] == 1

    saved = client.post("/api/collections", json={"name": "Schwache Themen", "config": config})
    assert saved.status_code == 200
    collection_id = saved.json()["id"]
    assert client.get(f"/api/collections/{collection_id}/results").json()["total"] == 1
    assert client.put(f"/api/collections/{collection_id}", json={"name": "Alt", "config": config,
                                                          "expected_revision": 0}).status_code == 422
    assert client.put(f"/api/collections/{collection_id}", json={"name": "Fokus", "config": config,
                                                          "expected_revision": 1}).json()["revision"] == 2
    assert client.post(f"/api/collections/{collection_id}/archive").status_code == 204
    assert client.get("/api/collections").json() == []


def test_mixed_view_or_groups_and_saved_grouping(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="mix-course", name="Datenstrukturen")
        session.add(course)
        session.flush()
        session.add(LearningTopic(course_id=course.id, slug="bäume", name="Bäume"))
        session.add(Deadline(source="fixture", source_key="mix-deadline", course_id=course.id,
                             title="Aufgabe 1", due_at=utc_now() + timedelta(days=2)))
        session.commit()

    app = FastAPI()
    app.include_router(collections_router(settings, factory, coordinator))
    client = TestClient(app)
    groups = [{"kind": "topics", "max_percent": 60}, {"kind": "deadlines", "status": "Bald"}]
    params = {"kind": "all", "group_by": "kind", "any_groups": json.dumps(groups)}
    preview = client.get("/api/collections/preview", params=params)
    assert preview.status_code == 200
    assert [(item["kind"], item["title"]) for item in preview.json()["items"]] == [
        ("deadlines", "Aufgabe 1")]
    assert client.get("/api/collections/preview", params={**params, "any_groups": "not-json"}).status_code == 422
    created = client.post("/api/collections", json={"name": "Zu prüfen", "config": {
        "kind": "all", "group_by": "kind", "any_groups": groups}})
    assert created.status_code == 200
    assert created.json()["config"]["group_by"] == "kind"
    assert [group["kind"] for group in created.json()["config"]["any_groups"]] == [
        "topics", "deadlines"]
    saved = client.get("/api/collections").json()[0]
    assert client.get(f"/api/collections/{saved['id']}/results").json()["total"] == 1
    assert client.post("/api/collections", json={"name": "Ungültig", "config": {
        "kind": "all", "any_groups": [{"kind": "deadlines", "sql": "DROP TABLE"}]}}).status_code == 422
