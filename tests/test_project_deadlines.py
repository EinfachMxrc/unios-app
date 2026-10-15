# SPDX-License-Identifier: AGPL-3.0-or-later

"""Project UTC deadlines survive fresh SQLite reads and revisioned mutations."""

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.models import Course, Project
from app.projects.api import project_router


@pytest.mark.parametrize("deadline, expected", [
    (None, None),
    ("2026-10-26T08:15:00Z", "2026-10-26T08:15:00Z"),
    ("2026-10-26T09:15:00+01:00", "2026-10-26T08:15:00Z"),
])
def test_project_deadline_round_trip_and_revisioned_archive(settings, factory, coordinator, deadline, expected):
    with factory() as session:
        course = Course(source="manual", source_id="deadline-fixture", name="Erfundener Projektkurs")
        session.add(course)
        session.commit()
        course_id = course.id
    app = FastAPI()
    app.include_router(project_router(settings, factory, coordinator))
    payload = {"name": "Erfundene Projektfrist", "course_id": course_id, "deadline_at": deadline}
    with TestClient(app) as client:
        created = client.post("/api/projects", json=payload)
        assert created.status_code == 201, created.text
        project_id = created.json()["id"]
        assert created.json()["deadline_at"] == expected
        assert created.json()["revision"] == 1
        with factory() as session:
            stored = session.get(Project, project_id)
            assert stored is not None
            expected_stored = datetime.fromisoformat(expected).replace(tzinfo=None) if expected else None
            assert stored.deadline_at == expected_stored

        # A separate request/session exercises the SQLite tzinfo loss.
        loaded = client.get(f"/api/projects/{project_id}")
        assert loaded.status_code == 200, loaded.text
        assert loaded.json()["deadline_at"] == expected
        assert loaded.json()["created_at"].endswith("Z")
        assert loaded.json()["updated_at"].endswith("Z")
        assert client.get("/api/projects").json()[0]["deadline_at"] == expected

        updated = client.put(f"/api/projects/{project_id}", json={**payload, "expected_revision": 1})
        assert updated.status_code == 200, updated.text
        assert updated.json()["deadline_at"] == expected
        assert updated.json()["revision"] == 2
        stale = client.put(f"/api/projects/{project_id}", json={**payload, "expected_revision": 1})
        assert stale.status_code == 409

        archived = client.post(f"/api/projects/{project_id}/archive", json={"expected_revision": 2})
        assert archived.status_code == 200, archived.text
        assert archived.json()["deadline_at"] == expected
        assert archived.json()["revision"] == 3
        assert archived.json()["archived_at"].endswith("Z")
        assert client.get("/api/projects").json() == []
        archived_list = client.get("/api/projects?include_archived=true").json()
        assert archived_list[0]["deadline_at"] == expected
        assert archived_list[0]["archived_at"].endswith("Z")
        assert client.get(f"/api/projects/{project_id}").json()["revision"] == 3

        restored = client.post(f"/api/projects/{project_id}/restore", json={"expected_revision": 3})
        assert restored.status_code == 200, restored.text
        assert restored.json()["deadline_at"] == expected
        assert restored.json()["revision"] == 4
        assert restored.json()["archived_at"] is None
        fresh = client.get(f"/api/projects/{project_id}")
        assert fresh.status_code == 200, fresh.text
        assert fresh.json()["deadline_at"] == expected
        assert fresh.json()["revision"] == 4
        assert client.post(f"/api/projects/{project_id}/archive", json={"expected_revision": 3}).status_code == 409
        assert client.get(f"/api/projects/{project_id}").json()["revision"] == 4


def test_naive_project_input_is_rejected_without_changing_revision(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="manual", source_id="naive-deadline-fixture", name="Erfundener Kurs")
        session.add(course)
        session.commit()
        course_id = course.id
    app = FastAPI()
    app.include_router(project_router(settings, factory, coordinator))
    payload = {"name": "Erfundener Zeitpunkt", "course_id": course_id}
    with TestClient(app) as client:
        invalid = client.post("/api/projects", json={**payload, "deadline_at": "2026-10-26T09:15:00"})
        assert invalid.status_code == 422
        assert client.get("/api/projects").json() == []
        created = client.post("/api/projects", json={**payload, "deadline_at": "2026-10-26T09:15:00+01:00"})
        assert created.status_code == 201, created.text
        project_id = created.json()["id"]
        invalid_update = client.put(f"/api/projects/{project_id}", json={
            **payload, "deadline_at": "2026-10-26T09:15:00", "expected_revision": 1,
        })
        assert invalid_update.status_code == 422
        loaded = client.get(f"/api/projects/{project_id}").json()
        assert loaded["revision"] == 1
        assert datetime.fromisoformat(loaded["deadline_at"]) == datetime(2026, 10, 26, 8, 15, tzinfo=UTC)
