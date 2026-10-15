# SPDX-License-Identifier: AGPL-3.0-or-later

"""Analytics count real source events and keep unknown ratios unknown."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    LearningTopic,
    Resource,
    ResourceVersion,
)
from app.main import create_app


def test_course_analytics_and_first_open_are_scoped_and_idempotent(settings, factory, coordinator):
    now = datetime.now(UTC)
    with factory() as session:
        first = Course(source="fixture", source_id="analytics-one", name="Programmieren")
        second = Course(source="fixture", source_id="analytics-two", name="Mathematik")
        session.add_all([first, second])
        session.flush()
        topic = LearningTopic(course_id=first.id, slug="rekursion", name="Rekursion")
        session.add(topic)
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="analytics-card")
        session.add(card)
        session.flush()
        for offset, rating in ((1, 1), (2, 3), (3, 3), (4, 3), (5, 3),
                               (16, 1), (17, 1), (18, 3), (19, 3), (20, 3)):
            session.add(AnkiReview(card_id=card.id, reviewed_at=now - timedelta(days=offset), rating=rating))
        for course in (first, second):
            resource = Resource(source="fixture", source_key=f"analytics-{course.id}",
                                course_id=course.id, kind="file", name="Skript.pdf", url="")
            session.add(resource)
            session.flush()
            session.add(ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                        relative_path=f"{resource.id}.pdf", size=20,
                                        mime_type="application/pdf", downloaded_at=now - timedelta(days=2)))
        session.commit()
        version_id = session.query(ResourceVersion).join(Resource).filter(Resource.course_id == first.id).first().id
        first_id, second_id = first.id, second.id

    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        report = client.get("/api/analytics/study").json()
        one = next(item for item in report["courses"] if item["course_id"] == first_id)
        two = next(item for item in report["courses"] if item["course_id"] == second_id)
        assert (one["new_versions_7d"], one["new_versions_opened"]) == (1, 0)
        assert (one["reviews_7d"], two["reviews_7d"]) == (5, 0)
        assert one["retention_14d"] == 0.8
        assert one["measured_score"] == 0.7
        assert one["retention_delta_points"] == 20
        assert two["retention_14d"] is None
        assert two["measured_score"] is None
        assert report["overall"]["new_versions_7d"] == 2
        assert client.post(f"/api/analytics/material-versions/{version_id}/opened").status_code == 204
        with factory() as session:
            first_opened = session.get(ResourceVersion, version_id).first_opened_at
        assert client.post(f"/api/analytics/material-versions/{version_id}/opened").status_code == 204
        with factory() as session:
            assert session.get(ResourceVersion, version_id).first_opened_at == first_opened
        assert client.get("/api/analytics/study").json()["overall"]["new_versions_opened"] == 1
        assert client.post("/api/analytics/material-versions/99999/opened").status_code == 404
