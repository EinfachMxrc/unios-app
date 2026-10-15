# SPDX-License-Identifier: AGPL-3.0-or-later

"""Peek panels show only locally recorded task facts."""

from datetime import timedelta

from fastapi.testclient import TestClient

from app.db.models import Assignment, Course, Deadline, SubmissionAttempt, utc_now
from app.main import create_app


def test_task_peek_shows_saved_status_and_linked_deadline(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="peek-course", name="Programmieren")
        session.add(course)
        session.flush()
        assignment = Assignment(source="fixture", source_key="peek-assignment", course_id=course.id,
                                title="Übung 5", due_at=utc_now() + timedelta(days=2))
        session.add(assignment)
        session.flush()
        deadline = Deadline(source="fixture", source_key="peek-assignment", course_id=course.id,
                            assignment_id=assignment.id, title=assignment.title, due_at=assignment.due_at)
        session.add(deadline)
        session.add(SubmissionAttempt(id="fake-peek-submission", assignment_id=assignment.id,
                                      state="archived", files=[], existing_status="none", existing_revision="",
                                      final_submit=False, requires_final_submit=False, statement_required=False,
                                      created_at=utc_now()))
        session.commit()
        assignment_id, deadline_id, course_id = assignment.id, deadline.id, course.id

    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assignment_view = client.get(f"/api/peek/assignments/{assignment_id}")
        assert assignment_view.status_code == 200
        assert assignment_view.json()["latest_submission_state"] == "archived"
        assert assignment_view.json()["open_url"] == f"/courses/{course_id}#assignment-{assignment_id}"
        deadline_view = client.get(f"/api/peek/deadlines/{deadline_id}")
        assert deadline_view.status_code == 200
        assert deadline_view.json()["assignment_id"] == assignment_id
        assert client.get("/api/peek/assignments/9999").status_code == 404
        assert client.get("/api/peek/deadlines/9999").status_code == 404
