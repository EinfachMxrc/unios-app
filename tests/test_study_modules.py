# SPDX-License-Identifier: AGPL-3.0-or-later

"""Study modules group existing topics without losing their learning data."""

from fastapi.testclient import TestClient

from app.db.models import Course, LearningTopic
from app.main import create_app


def test_modules_group_topics_and_reject_cross_course_assignment(settings, factory, coordinator):
    with factory() as session:
        first = Course(source="fixture", source_id="module-one", name="Programmieren")
        second = Course(source="fixture", source_id="module-two", name="Mathematik")
        session.add_all([first, second])
        session.flush()
        topic = LearningTopic(course_id=first.id, slug="rekursion", name="Rekursion")
        session.add(topic)
        session.commit()
        first_id, second_id, topic_id = first.id, second.id, topic.id

    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.get("/api/learning/topics").json()[0]["module_id"] is None
        created = client.post("/api/learning/modules", json={"course_id": first_id, "name": "Grundlagen"})
        assert created.status_code == 200
        module = created.json()[0]
        assert module["topic_count"] == 0
        assert client.post("/api/learning/modules", json={"course_id": first_id,
                                                             "name": "grundlagen"}).status_code == 400
        other_rows = client.post("/api/learning/modules", json={"course_id": second_id,
                                                                  "name": "Beweise"}).json()
        other = next(item for item in other_rows if item["course_id"] == second_id)
        assert client.patch(f"/api/learning/modules/topics/{topic_id}", json={
            "expected_module_id": None, "module_id": other["id"]}).status_code == 400
        assigned = client.patch(f"/api/learning/modules/topics/{topic_id}", json={
            "expected_module_id": None, "module_id": module["id"]})
        assert assigned.status_code == 200
        grouped = next(item for item in assigned.json() if item["id"] == module["id"])
        assert grouped["topic_ids"] == [topic_id]
        assert grouped["topic_count"] == 1
        assert grouped["measured_topics"] == 0
        assert grouped["anki_retention"] is None
        assert client.get("/api/learning/topics").json()[0]["module_id"] == module["id"]
        assert client.patch(f"/api/learning/modules/topics/{topic_id}", json={
            "expected_module_id": None, "module_id": None}).status_code == 409
        assert client.patch(f"/api/learning/modules/{module['id']}", json={
            "expected_revision": 1, "name": "Kontrollstrukturen"}).status_code == 200
        assert client.patch(f"/api/learning/modules/{module['id']}", json={
            "expected_revision": 1, "name": "Alt"}).status_code == 409
