# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.collections.api import collections_router
from app.db.models import (
    Assignment,
    Course,
    Deadline,
    Resource,
    ResourceVersion,
    utc_now,
)
from app.submissions.service import SubmissionCheck, save_check


def test_saved_views_distinguish_unread_overdue_and_known_submission_status(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="unified", name="Fiktives Fach")
        session.add(course)
        session.flush()
        assignment = Assignment(source="fixture", source_key="known", course_id=course.id, title="Bekannte Aufgabe")
        unknown = Assignment(source="fixture", source_key="unknown", course_id=course.id, title="Ungeprüfte Aufgabe")
        resource = Resource(source="fixture", source_key="unread", course_id=course.id, name="Skript", kind="file", url="")
        session.add_all([assignment, unknown, resource])
        session.flush()
        session.add_all([
            Deadline(source="fixture", source_key="old", course_id=course.id, assignment_id=assignment.id,
                     title=assignment.title, due_at=utc_now() - timedelta(days=1)),
            Deadline(source="fixture", source_key="new", course_id=course.id, assignment_id=unknown.id,
                     title=unknown.title, due_at=utc_now() + timedelta(days=1)),
            ResourceVersion(resource_id=resource.id, version=1, relative_path="uni/fixture.txt", sha256="a" * 64,
                            size=1, mime_type="text/plain"),
        ])
        session.commit()
        assignment_id = assignment.id
    save_check(settings, SubmissionCheck(assignment_id=assignment_id, checked_at=utc_now(), status="draft"))
    app = FastAPI()
    app.include_router(collections_router(settings, factory, coordinator))
    client = TestClient(app)
    overdue = client.get("/api/collections/preview", params={"kind": "deadlines", "time_filter": "overdue"}).json()
    assert [item["title"] for item in overdue["items"]] == ["Bekannte Aufgabe"]
    known = client.get("/api/collections/preview", params={"kind": "deadlines", "submission_filter": "unsubmitted"}).json()
    assert [item["title"] for item in known["items"]] == ["Bekannte Aufgabe"]
    save_check(settings, SubmissionCheck(assignment_id=assignment_id, checked_at=utc_now(), status="submitted"))
    assert client.get("/api/collections/preview", params={"kind": "deadlines", "submission_filter": "unsubmitted"}).json()["total"] == 0
    assert client.get("/api/collections/preview", params={"kind": "materials", "unread_only": True}).json()["total"] == 1
    with factory() as session:
        session.query(ResourceVersion).update({"first_opened_at": utc_now()})
        session.commit()
    assert client.get("/api/collections/preview", params={"kind": "materials", "unread_only": True}).json()["total"] == 0
    config = {"kind": "deadlines", "view": "table", "sort_direction": "desc", "visible_fields": ["title", "source"], "time_filter": "overdue"}
    saved = client.post("/api/collections", json={"name": "Überfällig", "config": config}).json()
    restored = client.get("/api/collections").json()[0]["config"]
    assert all(restored[key] == value for key, value in config.items())
    assert client.get(f"/api/collections/{saved['id']}/results").json()["total"] == 1
    assert client.get("/api/collections/preview", params={"kind": "notes", "visible_fields": json.dumps(["title", "token"])}).status_code == 422
    assert client.get("/api/collections/preview", params={"kind": "notes", "time_filter": "overdue"}).status_code == 422
