# SPDX-License-Identifier: AGPL-3.0-or-later

"""The local MCP bridge exposes only server-approved material."""

import asyncio
from datetime import UTC, datetime
from hashlib import sha256
from hmac import new

from fastapi.testclient import TestClient
from mcp import Client

from app.db.models import (
    Assignment,
    Course,
    Exam,
    ExamRegistration,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.main import create_app
from app.submissions.service import SubmissionCheck, save_check
from clients.uni_mcp.__main__ import build_server


def test_signed_remote_actor_is_recorded_and_forged_actor_is_rejected(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    actor = "synthetic-client-1"
    signature = new(settings.mcp_token.encode(), f"mcp-client:{actor}".encode(), sha256).hexdigest()
    headers = {"X-UniOS-MCP-Token": settings.mcp_token,
               "X-UniOS-MCP-Client": actor,
               "X-UniOS-MCP-Client-Signature": signature}
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/ai/mcp/courses", headers=headers).status_code == 200
        assert client.get("/api/ai/mcp/audit").json()[0]["actor"] == f"oauth:{actor}"
        headers["X-UniOS-MCP-Client"] = "forged-client"
        assert client.get("/api/ai/mcp/courses", headers=headers).status_code == 403


def test_mcp_access_respects_course_and_category_permissions(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r1", course_id=course.id,
                            kind="file", name="Schleifen.pdf", url="https://example.invalid/file")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/Schleifen.pdf", size=10,
                                  mime_type="application/pdf", downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=1,
                                 text="Schleifen wiederholen Anweisungen", markdown=None))
        session.commit()
        course_id, resource_id = course.id, resource.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    headers = {"X-UniOS-MCP-Token": "fixture-mcp-token"}
    with TestClient(app) as client:
        assert client.get("/api/ai/mcp/state").json() == {"configured": True, "enabled": True}
        assert client.get("/api/ai/mcp/courses").status_code == 403
        assert client.get("/api/ai/mcp/courses", headers=headers).json() == [
            {"id": course_id, "name": "Programmieren"}]
        week = client.get(f"/api/ai/mcp/courses/{course_id}/week", headers=headers)
        assert week.status_code == 200
        assert week.json()["materials"][0]["resource_id"] == resource_id
        assert week.json()["assignments"] == []
        text = client.get(f"/api/ai/mcp/resource/{resource_id}/text", headers=headers)
        assert text.status_code == 200 and "Schleifen" in text.json()["pages"][0]["text"]
        assert len(client.get("/api/ai/mcp/search", params={"query": "Schleifen"},
                              headers=headers).json()) == 1
        assert client.get("/api/ai/mcp/search", params={"query": "Schleifen", "course_id": 999},
                          headers=headers).json() == []
        with factory() as session:
            newer = ResourceVersion(resource_id=resource_id, version=2, sha256="b" * 64,
                                    relative_path="uni/Schleifen-v2.pdf", size=10,
                                    mime_type="application/pdf", downloaded_at=datetime.now(UTC))
            session.add(newer)
            session.flush()
            session.add(ResourceText(version_id=newer.id, page_number=1,
                                     text="Schleifen und Rekursion", markdown=None))
            session.commit()
        hits = client.get("/api/ai/mcp/search", params={"query": "Schleifen", "course_id": course_id},
                          headers=headers).json()
        assert len(hits) == 1 and hits[0]["version"] == 2
        assert client.get("/api/ai/mcp/search", params={"query": "wiederholen"},
                          headers=headers).json() == []
        assert client.get("/api/ai/mcp/deadlines", headers=headers).status_code == 403
        assert client.put("/api/ai/mcp/state", json={"enabled": False}).json()["enabled"] is False
        assert client.get("/api/ai/mcp/courses", headers=headers).status_code == 503
        assert client.put("/api/ai/mcp/state", json={"enabled": True}).json()["enabled"] is True

        client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False})
        assert client.get("/api/ai/mcp/courses", headers=headers).json() == []
        assert client.get(f"/api/ai/mcp/courses/{course_id}/week", headers=headers).status_code == 404
        assert client.get(f"/api/ai/mcp/resource/{resource_id}/text", headers=headers).status_code == 404
        assert client.get("/api/ai/mcp/search", params={"query": "Schleifen"},
                          headers=headers).json() == []
        payload = {"schema_version": 1, "generated_by": "fixture",
                   "generated_at": datetime.now(UTC).isoformat(),
                   "source": {"resource_id": resource_id, "version": 1},
                   "cards": [{"card_type": "basic", "front": "Frage?", "back": "Antwort",
                              "course": "prog", "topic": "schleifen", "source_page": 1,
                              "confidence": "high"}]}
        assert client.post("/api/ai/mcp/cards", json=payload, headers=headers).status_code == 403
        assert client.get("/api/anki/queue").json() == []
        client.put(f"/api/ai/access/course/{course_id}", json={"allowed": True})
        assert client.post("/api/ai/mcp/cards", json=payload, headers=headers).json() == {
            "created": 1, "status": "proposed"}
        assert client.get("/api/anki/queue").json()[0]["status"] == "proposed"
        client.put("/api/ai/access/category/course_material", json={"allowed": False})
        assert client.get("/api/ai/mcp/courses", headers=headers).json() == []
        assert client.get(f"/api/ai/mcp/resource/{resource_id}/text", headers=headers).status_code == 404
        assert client.get("/api/ai/mcp/search", params={"query": "Schleifen"},
                          headers=headers).status_code == 403
        client.put("/api/ai/access/category/course_material", json={"allowed": True})
        with factory() as session:
            session.get(Resource, resource_id).group_category = "other_group"
            session.commit()
        assert client.get(f"/api/ai/mcp/resource/{resource_id}/text", headers=headers).status_code == 404
        assert client.get("/api/ai/mcp/search", params={"query": "Schleifen"},
                          headers=headers).json() == []
        assert any(not item["permitted"] for item in client.get("/api/ai/mcp/audit").json())


def test_mcp_state_and_audit_need_a_token_from_a_cross_site_caller(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    cross_site = {"Origin": "https://foreign.example", "Sec-Fetch-Site": "cross-site"}
    with TestClient(app) as client:
        # No Origin/Sec-Fetch-Site at all looks like the dashboard's own fetch.
        assert client.get("/api/ai/mcp/state").status_code == 200
        assert client.get("/api/ai/mcp/audit").status_code == 200
        # A declared cross-site browser request without a token is rejected.
        assert client.get("/api/ai/mcp/state", headers=cross_site).status_code == 403
        assert client.get("/api/ai/mcp/audit", headers=cross_site).status_code == 403
        # The same cross-site request succeeds once it carries a valid MCP token.
        with_token = {**cross_site, "X-UniOS-MCP-Token": "fixture-mcp-token"}
        assert client.get("/api/ai/mcp/state", headers=with_token).status_code == 200
        assert client.get("/api/ai/mcp/audit", headers=with_token).status_code == 200


def test_actor_is_unknown_for_non_loopback_caller_without_client_signature(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app, client=("192.0.2.1", 50000)) as remote_client:
        assert remote_client.get("/api/ai/mcp/courses").status_code == 403  # no token supplied
    with TestClient(app) as client:
        rows = client.get("/api/ai/mcp/audit").json()
    assert rows[0]["tool"] == "list_courses" and rows[0]["actor"] == "unknown"


def test_mcp_server_registers_only_implemented_tools():
    server = build_server("http://127.0.0.1:8000", "fixture-token", legacy=True)

    async def names():
        async with Client(server) as client:
            return {tool.name for tool in (await client.list_tools()).tools}

    assert asyncio.run(names()) == {
        "list_courses", "get_resource_text", "search", "get_changes",
        "get_deadlines", "get_anki_status", "submit_anki_candidates", "submit_exercises",
        "list_projects", "search_project_repo", "get_exam_status", "get_submission_status",
            "get_entity_schema", "get_weekly_study_context", "get_timetable", "get_mail_hints", "run_entity_action",
    }


def test_mcp_personal_status_needs_release_and_omits_grades_and_files(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    with factory() as session:
        allowed_course = Course(source="fixture", source_id="one", name="Freier Kurs")
        blocked_course = Course(source="fixture", source_id="two", name="Gesperrter Kurs")
        session.add_all([allowed_course, blocked_course])
        session.flush()
        allowed_exam = Exam(course_id=allowed_course.id, source_key="exam-one", title="Fiktive Prüfung")
        blocked_exam = Exam(course_id=blocked_course.id, source_key="exam-two", title="Private Prüfung")
        session.add_all([allowed_exam, blocked_exam])
        session.flush()
        session.add_all([
            ExamRegistration(exam_id=allowed_exam.id, status="registered", checked_at=datetime.now(UTC),
                             screenshot_path="private-proof.png"),
            ExamRegistration(exam_id=blocked_exam.id, status="open", checked_at=datetime.now(UTC)),
        ])
        allowed_assignment = Assignment(source="fixture", source_key="assign-one", course_id=allowed_course.id,
                                        title="Fiktive Abgabe", due_at=datetime.now(UTC))
        blocked_assignment = Assignment(source="fixture", source_key="assign-two", course_id=blocked_course.id,
                                        title="Private Abgabe", due_at=datetime.now(UTC))
        session.add_all([allowed_assignment, blocked_assignment])
        session.commit()
        permitted_course_id = allowed_course.id
        denied_course_id = blocked_course.id
        permitted_assignment_id = allowed_assignment.id
    save_check(settings, SubmissionCheck(assignment_id=permitted_assignment_id, checked_at=datetime.now(UTC),
                                         status="submitted", grade="private grade", feedback="private feedback",
                                         archive_files=2))
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    headers = {"X-UniOS-MCP-Token": "fixture-mcp-token"}
    with TestClient(app) as client:
        assert client.get("/api/ai/mcp/exam-status", headers=headers).status_code == 403
        assert client.get("/api/ai/mcp/submission-status", headers=headers).status_code == 403
        client.put(f"/api/ai/access/course/{denied_course_id}", json={"allowed": False})
        client.put("/api/ai/access/category/exam_status", json={"allowed": True})
        client.put("/api/ai/access/category/submission_status", json={"allowed": True})
        exams = client.get("/api/ai/mcp/exam-status", headers=headers).json()
        assert len(exams) == 1 and exams[0]["status"] == "registered"
        assert exams[0]["course_id"] == permitted_course_id
        assert "screenshot" not in str(exams) and "grade" not in str(exams)
        submissions = client.get("/api/ai/mcp/submission-status", headers=headers).json()
        assert len(submissions) == 1 and submissions[0]["status"] == "submitted"
        assert submissions[0]["assignment_id"] == permitted_assignment_id
        assert "private grade" not in str(submissions) and "private feedback" not in str(submissions)
        assert client.get("/api/ai/mcp/submission-status", params={"course_id": denied_course_id},
                          headers=headers).status_code == 404
        assert client.get("/api/ai/mcp/submission-status", params={"course_id": permitted_course_id},
                          headers=headers).json() == submissions


def test_mcp_anki_status_counts_manual_note_cards(settings, factory, coordinator):
    from app.db.models import AnkiCardQueue, LearningTopic

    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    with factory() as session:
        course = Course(source="fixture", source_id="anki", name="Mathematik")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="anki-r", course_id=course.id,
                            kind="file", name="Folien.pdf", url="https://example.invalid/file")
        topic = LearningTopic(course_id=course.id, slug="mengen", name="Mengen")
        session.add_all([resource, topic])
        session.flush()
        session.add_all([
            AnkiCardQueue(resource_id=resource.id, status="proposed", payload="{}"),
            AnkiCardQueue(resource_id=None, topic_id=topic.id, origin="manual", status="approved", payload="{}"),
        ])
        session.commit()

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        status = client.get("/api/ai/mcp/anki-status", headers={"X-UniOS-MCP-Token": "fixture-mcp-token"})
    assert status.status_code == 200
    assert status.json()["proposed"] == 1 and status.json()["approved"] == 1
