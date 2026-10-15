# SPDX-License-Identifier: AGPL-3.0-or-later

"""Rules preview safely, execute once, and can remove local pins."""

from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.models import Course, Deadline, utc_now
from app.notify.service import Notifier
from app.rules.api import rules_router
from app.rules.service import evaluate_enabled


def test_rule_preview_idempotence_edit_and_undo(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="course-rule", name="Programmieren")
        session.add(course)
        session.flush()
        session.add(Deadline(source="fixture", source_key="rule-one", course_id=course.id,
                             title="Übung abgeben", due_at=utc_now() + timedelta(days=2)))
        session.commit()
        course_id = course.id

    notifier = Notifier(settings, coordinator)
    app = FastAPI()
    app.include_router(rules_router(settings, factory, coordinator, notifier))
    client = TestClient(app)
    config = {"name": "Fristen", "trigger": "deadline_soon", "action": "pin",
              "course_id": course_id, "days": 7, "max_percent": None, "enabled": True}
    preview = client.post("/api/rules/preview", json=config)
    assert preview.status_code == 200
    assert preview.json()["total"] == 1
    assert client.get("/api/rules/audit").json() == []
    saved = client.post("/api/rules", json=config)
    assert saved.status_code == 200
    rule_id = saved.json()["id"]
    assert evaluate_enabled(factory, settings, coordinator, notifier) == 1
    assert evaluate_enabled(factory, settings, coordinator, notifier) == 0
    assert [pin["title"] for pin in client.get("/api/rules/pins").json()] == ["Übung abgeben"]
    assert client.post(f"/api/rules/{rule_id}/run").json()["created"] == 0

    changed = client.put(f"/api/rules/{rule_id}", json={**config, "days": 3, "expected_revision": 1})
    assert changed.status_code == 200
    assert changed.json()["revision"] == 2
    assert client.get("/api/rules/pins").json() == []
    assert client.post(f"/api/rules/{rule_id}/run").json()["created"] == 1
    audit = client.get("/api/rules/audit").json()
    assert len(audit) == 2
    assert client.post(f'/api/rules/audit/{audit[0]["id"]}/undo').status_code == 204
    assert client.get("/api/rules/pins").json() == []
    assert client.put(f"/api/rules/{rule_id}", json={**config, "expected_revision": 1}).status_code == 409
    assert client.post("/api/rules/preview", json={**config, "trigger": "weak_topic"}).status_code == 422
