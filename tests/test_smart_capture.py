# SPDX-License-Identifier: AGPL-3.0-or-later

"""Short local captures become linked tasks only when the course is unambiguous."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db.models import (
    Assignment,
    Course,
    Deadline,
    IntakeDecision,
    LinkEdge,
    Resource,
)
from app.main import create_app


def test_smart_capture_task_and_review(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE jots_fts USING fts5(jot_id UNINDEXED, body)"))
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        course = Course(source="fixture", source_id="programming", name="Programmieren 1")
        other = Course(source="fixture", source_id="math", name="Mathematik 1")
        session.add_all([course, other])
        session.flush()
        session.add(Resource(source="fixture", source_key="sheet3", course_id=course.id,
                             kind="file", name="Übungsblatt 3.pdf", url="", group_category="general"))
        session.commit()
        course_id = course.id

    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        jot_id = str(uuid4())
        payload = {"id": jot_id, "kind": "thought",
                   "body": "Übungsblatt 3 Aufgabe 2 nochmal mit Lukas durchgehen bis Freitag",
                   "created_at": datetime.now(UTC).isoformat()}
        created = client.post("/api/jots", json=payload)
        assert created.status_code == 200, created.text
        assert created.json()["course_id"] == course_id
        task_id = created.json()["task_id"]
        assert isinstance(task_id, int)
        assert client.post("/api/jots", json=payload).json()["task_id"] == task_id

        unclear_id = str(uuid4())
        unclear = client.post("/api/jots", json={"id": unclear_id, "kind": "todo",
             "body": "Aufgabe 2 bearbeiten", "created_at": datetime.now(UTC).isoformat()})
        assert unclear.status_code == 200
        assert unclear.json()["task_id"] is None
        assert client.patch(f"/api/jots/{unclear_id}/assignment", json={"course_id": course_id}).json()["task_id"]

    with factory() as session:
        assert len(session.scalars(select(Assignment).where(Assignment.source == "smart_capture")).all()) == 2
        assert session.scalar(select(Deadline).where(Deadline.source_key == jot_id)).assignment_id == task_id
        assert session.scalar(select(LinkEdge).where(LinkEdge.from_id == jot_id)).to_id == str(task_id)
        assert session.scalar(select(IntakeDecision).where(IntakeDecision.source_id == unclear_id)).state == "accepted"
