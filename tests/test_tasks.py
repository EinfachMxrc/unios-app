# SPDX-License-Identifier: AGPL-3.0-or-later

"""Personal tasks: repeatable creation, revision-safe edits, trash and export."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.models import Course
from app.export.repository import TABLES
from app.main import create_app


def prepare(factory) -> int:
    with factory() as session:
        course = Course(source="moodle", source_id="1", name="Mathematik")
        session.add(course)
        session.commit()
        return course.id


def client_for(settings, factory, coordinator) -> TestClient:
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator))


def test_creating_a_task_twice_stores_it_once(settings, factory, coordinator):
    course_id = prepare(factory)
    payload = {"id": str(uuid4()), "title": "  Skript   lesen ", "due_on": "2026-11-27", "course_id": course_id}
    with client_for(settings, factory, coordinator) as client:
        first = client.post("/api/tasks", json=payload)
        assert first.status_code == 201, first.text
        assert first.json()["title"] == "Skript lesen"
        assert first.json()["course_name"] == "Mathematik"
        assert client.post("/api/tasks", json=payload).json()["id"] == payload["id"]
        assert len(client.get("/api/tasks").json()["tasks"]) == 1
        assert client.post("/api/tasks", json={**payload, "title": "Etwas anderes"}).status_code == 409


def test_blank_titles_and_unknown_courses_are_rejected(settings, factory, coordinator):
    prepare(factory)
    with client_for(settings, factory, coordinator) as client:
        assert client.post("/api/tasks", json={"id": str(uuid4()), "title": "   "}).status_code == 400
        assert client.post("/api/tasks", json={"id": str(uuid4()), "title": "x", "course_id": 999}).status_code == 400
        assert client.get("/api/tasks").json()["tasks"] == []


def test_edits_need_the_current_revision_and_track_completion(settings, factory, coordinator):
    prepare(factory)
    task_id = str(uuid4())
    with client_for(settings, factory, coordinator) as client:
        client.post("/api/tasks", json={"id": task_id, "title": "Blatt 4", "due_on": "2026-11-27"})
        done = client.patch(f"/api/tasks/{task_id}", json={"expected_revision": 1, "status": "done"})
        assert done.status_code == 200, done.text
        assert done.json()["completed_at"]
        assert done.json()["due_on"] == "2026-11-27"
        stale = client.patch(f"/api/tasks/{task_id}", json={"expected_revision": 1, "title": "Zu spät"})
        assert stale.status_code == 409
        reopened = client.patch(f"/api/tasks/{task_id}",
                                json={"expected_revision": 2, "status": "open", "due_on": None})
        assert reopened.json()["completed_at"] is None
        assert reopened.json()["due_on"] is None
        empty = client.patch(f"/api/tasks/{task_id}", json={"expected_revision": 3, "title": None})
        assert empty.status_code == 400


def test_unfinished_tasks_come_first_ordered_by_due_date(settings, factory, coordinator):
    prepare(factory)
    with client_for(settings, factory, coordinator) as client:
        ids = {}
        for title, due in (("Ohne Datum", None), ("Später", "2026-12-01"), ("Bald", "2026-11-26"),
                           ("Fertig", "2026-11-01")):
            ids[title] = str(uuid4())
            client.post("/api/tasks", json={"id": ids[title], "title": title, "due_on": due})
        client.patch(f"/api/tasks/{ids['Fertig']}", json={"expected_revision": 1, "status": "done"})
        titles = [item["title"] for item in client.get("/api/tasks").json()["tasks"]]
        assert titles == ["Bald", "Später", "Ohne Datum", "Fertig"]


def test_a_trashed_task_is_hidden_and_can_come_back(settings, factory, coordinator):
    prepare(factory)
    task_id = str(uuid4())
    with client_for(settings, factory, coordinator) as client:
        client.post("/api/tasks", json={"id": task_id, "title": "Anmelden"})
        assert client.post(f"/api/tasks/{task_id}/trash").status_code == 200
        assert client.get("/api/tasks").json()["tasks"] == []
        assert client.patch(f"/api/tasks/{task_id}", json={"expected_revision": 2, "status": "done"}).status_code == 404
        listed = client.get("/api/trash").json()["items"]
        assert [(item["kind"], item["title"]) for item in listed] == [("task", "Anmelden")]
        assert client.post(f"/api/trash/task/{task_id}/restore").status_code == 200
        assert [item["title"] for item in client.get("/api/tasks").json()["tasks"]] == ["Anmelden"]
        client.post(f"/api/tasks/{task_id}/trash")
        assert client.delete("/api/trash").json() == {"erased": 1}
        assert client.get("/api/trash").json()["items"] == []


def test_tasks_belong_to_the_personal_export():
    assert TABLES["tasks"] == "tasks"
