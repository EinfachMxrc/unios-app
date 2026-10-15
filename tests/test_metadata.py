# SPDX-License-Identifier: AGPL-3.0-or-later

"""Tags and small properties stay typed and feed saved views."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.collections.api import collections_router
from app.db.models import Assignment, Course, Exam, Note, Project, Resource
from app.metadata.api import metadata_router


def test_metadata_revisions_and_collection_filter(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="meta-course", name="Programmieren")
        session.add(course)
        session.flush()
        session.add(Note(id="00000000-0000-0000-0000-000000000011", course_id=course.id,
                         title="Rekursion", current_revision=1))
        other = Resource(source="fixture", source_key="hidden-meta", course_id=course.id,
                         kind="file", name="Fremd", url="", group_category="other_group")
        session.add(other)
        assignment = Assignment(source="fixture", source_key="meta-assignment", course_id=course.id,
                                title="Aufgabe")
        exam = Exam(course_id=course.id, source_key="fixture:exam", title="Prüfung")
        project = Project(course_id=course.id, name="Gruppenprojekt")
        session.add_all([assignment, exam, project])
        session.commit()
        other_id = other.id
        object_ids = {"assignment": assignment.id, "exam": exam.id, "project": project.id}

    app = FastAPI()
    app.include_router(metadata_router(factory, coordinator))
    app.include_router(collections_router(settings, factory, coordinator))
    client = TestClient(app)
    path = "/api/metadata/note/00000000-0000-0000-0000-000000000011"
    assert client.get(path).json()["revision"] == 0
    payload = {"tags": ["#Prüfung", "prüfung", "nacharbeiten"], "priority": "high",
               "exam_relevant": True, "difficulty": "hard", "workflow_status": "working",
               "expected_revision": 0}
    saved = client.put(path, json=payload)
    assert saved.status_code == 200
    assert saved.json()["tags"] == ["prüfung", "nacharbeiten"]
    assert client.put(path, json=payload).status_code == 409
    assert client.put(path, json={**payload, "tags": ["bad tag"], "expected_revision": 1}).status_code == 422
    assert client.get("/api/metadata/tags").json() == ["nacharbeiten", "prüfung"]
    assert client.get(f"/api/metadata/material/{other_id}").status_code == 404
    for kind, object_id in object_ids.items():
        object_path = f"/api/metadata/{kind}/{object_id}"
        assert client.get(object_path).json()["revision"] == 0
        assert client.put(object_path, json={**payload, "expected_revision": 0}).status_code == 200
        assert client.get(object_path).json()["priority"] == "high"
    results = client.get("/api/collections/preview", params={"kind": "notes", "tag": "prüfung",
                       "priority": "high", "exam_relevant": True, "difficulty": "hard",
                       "workflow_status": "working"})
    assert results.status_code == 200
    assert [item["title"] for item in results.json()["items"]] == ["Rekursion"]
    assert results.json()["items"][0]["tags"] == ["prüfung", "nacharbeiten"]
    assert client.get("/api/collections/preview", params={"kind": "notes", "tag": "anderes"}).json()["total"] == 0
