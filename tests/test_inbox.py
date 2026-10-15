# SPDX-License-Identifier: AGPL-3.0-or-later

"""Capture and classify fabricated study content without fetching the source site."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.models import Course
from app.inbox.api import inbox_router
from app.inbox.search import search_clips


def test_web_clip_is_searchable_and_can_be_classified(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="course-1", name="Algorithmen")
        session.add(course)
        session.commit()
        course_id = course.id
    app = FastAPI()
    app.include_router(inbox_router(settings, factory, coordinator))
    client = TestClient(app)

    created = client.post("/api/inbox/clips", json={
        "kind": "web", "title": "Sortierverfahren", "url": "https://example.invalid/sort?token=secret&chapter=1",
        "body": "Merge Sort teilt die Liste in zwei Hälften.",
    })
    assert created.status_code == 200
    clip = created.json()
    assert clip["url"] == "https://example.invalid/sort?chapter=1"
    assert clip["course_id"] is None
    assert client.post("/api/inbox/clips", json={"kind": "web", "title": "Unsicher",
                                                  "url": "javascript:alert(1)"}).status_code == 400
    with factory() as session:
        found = search_clips(session, "Merge Sort")
        assert found == []

    assigned = client.patch(f"/api/inbox/clips/{clip['id']}", json={
        "expected_revision": 1, "course_id": course_id, "filed": True,
    })
    assert assigned.status_code == 200
    assert assigned.json()["filed"] is True
    assert assigned.json()["course_id"] == course_id
    with factory() as session:
        assert [item["id"] for item in search_clips(session, "Merge Sort")] == [clip["id"]]
    assert client.patch(f"/api/inbox/clips/{clip['id']}", json={
        "expected_revision": 1, "course_id": None,
    }).status_code == 409
    assert len(client.get("/api/inbox").json()["clips"]) == 1


def test_upload_keeps_original_and_rejects_oversize(settings, factory, coordinator, monkeypatch):
    app = FastAPI()
    app.include_router(inbox_router(settings, factory, coordinator))
    client = TestClient(app)
    response = client.post("/api/inbox/upload", files={"file": ("Skizze.txt", b"Hallo Uni")})
    assert response.status_code == 200
    name = response.json()["name"]
    assert (settings.data_dir / "drop" / name).read_bytes() == b"Hallo Uni"
    assert client.get("/api/inbox").json()["files"][0]["name"] == name

    monkeypatch.setattr("app.inbox.api.MAX_UPLOAD_SIZE", 3)
    failed = client.post("/api/inbox/upload", files={"file": ("gross.txt", b"1234")})
    assert failed.status_code == 413
    assert len(list((settings.data_dir / "drop").iterdir())) == 1
