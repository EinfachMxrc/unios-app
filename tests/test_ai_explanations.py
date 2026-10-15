# SPDX-License-Identifier: AGPL-3.0-or-later

"""Question explanations return through review without changing the source question."""

import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from alembic import command
from app.db.models import (
    Course,
    MaterialAnnotation,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.db.session import make_engine
from app.main import create_app


def _question(settings, factory):
    with factory() as session:
        course = Course(source="fixture", source_id="question-course", name="Fiktive Informatik")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="question-resource", course_id=course.id,
                            kind="file", name="Schleifen.pdf", url="", group_category="general")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/schleifen.pdf", size=100, mime_type="application/pdf")
        session.add(version)
        session.flush()
        version_id = version.id
        session.add(ResourceText(version_id=version_id, page_number=1, text="Eine Schleife", markdown=None))
        question_id = str(uuid4())
        session.add(MaterialAnnotation(id=question_id, resource_id=resource.id,
                                       source_version_id=version_id, kind="question", quote="Eine Schleife",
                                       comment="Warum endet sie?", source_page=1))
        session.commit()
        course_id, resource_id = course.id, resource.id
    folder = settings.data_dir / "annotations"
    folder.mkdir(parents=True, exist_ok=True)
    event = {"action": "create", "id": question_id, "resource_id": resource_id,
             "source_version_id": version_id, "source": "fixture", "source_key": "question-resource",
             "source_version": 1, "kind": "question", "quote": "Eine Schleife",
             "comment": "Warum endet sie?", "context_before": "", "context_after": "",
             "source_page": 1, "source_rects": [], "resolved": False, "revision": 1,
             "created_at": datetime.now(UTC).isoformat(), "updated_at": datetime.now(UTC).isoformat()}
    (folder / f"{resource_id}.jsonl").write_text(json.dumps(event) + "\n", encoding="utf-8")
    return course_id, resource_id, question_id


def _payload(question_id):
    return {"schema_version": 1, "generated_by": "fixture",
            "generated_at": datetime.now(UTC).isoformat(),
            "explanations": [{"question_id": question_id,
                              "answer": "Sie endet, wenn die Bedingung falsch wird."}]}


def test_question_package_import_review_and_outbox(settings, factory, coordinator):
    course_id, _resource_id, question_id = _question(settings, factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        package = client.post("/api/ai/package", json={"course_id": course_id, "mode": "questions"})
        assert package.status_code == 200, package.text
        with ZipFile(BytesIO(package.content)) as archive:
            assert "explanation_schema.json" in archive.namelist()
            assert question_id in archive.read("offene-fragen.md").decode()
            assert "question_id" in archive.read("anleitung.md").decode()
        payload = _payload(question_id)
        assert client.post("/api/ai/explanations/import", json={**payload,
            "explanations": [{"question_id": str(uuid4()), "answer": "Falsch"}]}).status_code == 404
        assert client.post("/api/ai/explanations/import", json={**payload,
            "explanations": [payload["explanations"][0]] * 2}).status_code == 422
        assert client.post("/api/ai/explanations/import", json={**payload,
            "explanations": [{**payload["explanations"][0], "answer": " "}]}).status_code == 422
        assert client.get("/api/learning/questions").json()["questions"][0]["approved_explanation"] is None
        imported = client.post("/api/ai/explanations/import", json=payload)
        assert imported.status_code == 201 and imported.json() == {"created": 1, "status": "proposed"}
        item = client.get("/api/ai/explanations").json()[0]
        assert item["question"] == "Warum endet sie?" and item["status"] == "proposed"
        reviewed = client.put(f"/api/ai/explanations/{item['id']}", json={
            "status": "approved", "answer": "  Nach dem Abbruch der Bedingung. "})
        assert reviewed.status_code == 200, reviewed.text
        assert reviewed.json()["answer"] == "Nach dem Abbruch der Bedingung."
        assert client.put(f"/api/ai/explanations/{item['id']}", json={
            "status": "rejected", "answer": "Nein"}).status_code == 409
        assert client.get("/api/learning/questions").json()["questions"][0]["approved_explanation"] == (
            "Nach dem Abbruch der Bedingung.")
        assert client.get(f"/api/courses/{course_id}/material").json()["questions"][0]["comment"] == (
            "Warum endet sie?")

        outbox = settings.data_dir / "ai" / "outbox"
        outbox.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(payload)
        (outbox / "erklaerung.json").write_text(raw, encoding="utf-8")
        result = client.post("/api/ai/outbox/process")
        assert result.status_code == 200 and result.json()["explanations"] == 1
        assert len(list((outbox / "processed").glob("*.json"))) == 1
        (outbox / "nochmal.json").write_text(raw, encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["duplicates"] == 1
        (outbox / "falsch.json").write_text(json.dumps({**payload, "cards": []}), encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["rejected"] == 1
        assert len(list((outbox / "rejected").glob("*.error.txt"))) == 1

        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False}).status_code == 200
        assert client.post("/api/ai/explanations/import", json=payload).status_code == 403
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": True}).status_code == 200
        assert client.put("/api/ai/access/category/learning_questions", json={"allowed": False}).status_code == 200
        assert client.post("/api/ai/explanations/import", json=payload).status_code == 403
        with factory() as session:
            session.delete(session.get(MaterialAnnotation, question_id))
            session.commit()
        archived = client.get("/api/ai/explanations")
        assert archived.status_code == 200
        assert archived.json()[0]["question"] == "Ursprüngliche Frage wurde gelöscht"


def test_existing_outbox_receipt_survives_explanation_upgrade(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "a742e10f8c31")  # pragma: allowlist secret
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO ai_outbox_receipts "
                                "(sha256, imported_at, card_count, exercise_count) "
                                "VALUES (:sha256, :imported_at, 2, 1)"),
                           {"sha256": "c" * 64, "imported_at": datetime.now(UTC)})
    engine.dispose()
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    with engine.connect() as connection:
        receipt = connection.execute(text("SELECT card_count, exercise_count, explanation_count "
                                          "FROM ai_outbox_receipts WHERE sha256 = :sha256"),
                                     {"sha256": "c" * 64}).one()
        assert receipt == (2, 1, 0)
    engine.dispose()


def test_learning_and_explanations_open_as_direct_dashboard_urls(settings, coordinator, tmp_path):
    built = tmp_path / "react"
    built.mkdir()
    (built / "index.html").write_text("<html>Dashboard</html>", encoding="utf-8")
    web_settings = settings.model_copy(update={"serve_react": True, "react_dist_dir": built})
    app = create_app(web_settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for route in ("/learning", "/explanations"):
            response = client.get(route)
            assert response.status_code == 200
            assert response.text == "<html>Dashboard</html>"
