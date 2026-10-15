# SPDX-License-Identifier: AGPL-3.0-or-later

"""Exercise results stay proposals until the user reviews them."""

import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from typer.testing import CliRunner

from alembic import command
from app.cli.main import cli
from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.db.session import make_engine
from app.main import create_app


def _material(factory) -> tuple[int, int, int]:
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        ids = []
        for number, group in ((1, "general"), (2, "other_group")):
            resource = Resource(source="fixture", source_key=f"r{number}", course_id=course.id,
                                kind="file", name=f"Schleifen {number}",
                                url="https://example.invalid/file", group_category=group)
            session.add(resource)
            session.flush()
            version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                      relative_path=f"uni/schleifen-{number}.pdf", size=10,
                                      mime_type="application/pdf", downloaded_at=datetime.now(UTC))
            session.add(version)
            session.flush()
            session.add(ResourceText(version_id=version.id, page_number=1,
                                     text=f"Eine while-Schleife {number}", markdown=None))
            ids.append(resource.id)
        session.commit()
        return course.id, ids[0], ids[1]


def _payload(resource_id: int) -> dict:
    return {"schema_version": 1, "generated_by": "fixture", "generated_at": datetime.now(UTC).isoformat(),
            "source": {"resource_id": resource_id, "version": 1},
            "exercises": [{"question": "Erkläre eine while-Schleife.", "topic": "schleifen",
                           "difficulty": "easy", "sample_solution": "Sie wiederholt Anweisungen.",
                           "solution_steps": "Bedingung prüfen, Block ausführen, erneut prüfen.",
                           "source_page": 1}]}


def test_exercise_package_import_review_and_permissions(settings, factory, coordinator):
    course_id, resource_id, blocked_id = _material(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        package = client.post("/api/ai/package", json={"course_id": course_id, "mode": "exercises"})
        assert package.status_code == 200, package.text
        with ZipFile(BytesIO(package.content)) as archive:
            names = archive.namelist()
            assert "exercise_schema.json" in names
            assert "card_schema.json" not in names
            assert f"materials/{resource_id}-v1.md" in names
            assert f"materials/{blocked_id}-v1.md" not in names
        payload = _payload(resource_id)
        assert client.post("/api/ai/exercises/import", json={**payload, "source": {
            "resource_id": blocked_id, "version": 1}}).status_code == 404
        assert client.post("/api/ai/exercises/import", json={**payload, "exercises": [
            {**payload["exercises"][0], "question": "   "}]}).status_code == 422
        assert client.post("/api/ai/exercises/import", json={**payload, "exercises": [
            {**payload["exercises"][0], "source_page": 9}]}).status_code == 422
        created = client.post("/api/ai/exercises/import", json=payload)
        assert created.status_code == 201, created.text
        item = created.json()[0]
        assert item["status"] == "proposed"
        assert client.get("/api/anki/queue").json() == []
        updated = client.put(f"/api/ai/exercises/{item['id']}", json={
            **payload["exercises"][0], "question": "Beschreibe die Wiederholung.", "status": "approved"})
        assert updated.status_code == 200, updated.text
        assert updated.json()["exercise"]["question"] == "Beschreibe die Wiederholung."
        assert client.put(f"/api/ai/exercises/{item['id']}", json={
            **payload["exercises"][0], "status": "rejected"}).status_code == 409
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False}).status_code == 200
        assert client.post("/api/ai/exercises/import", json=payload).status_code == 403


def test_approved_exercise_can_be_practiced_with_immutable_attempts(settings, factory, coordinator):
    _course_id, resource_id, _blocked_id = _material(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        item = client.post("/api/ai/exercises/import", json=_payload(resource_id)).json()[0]
        assert client.get("/api/learning/practice").json() == []
        assert client.post(f"/api/learning/practice/{item['id']}/attempt", json={
            "answer": "Antwort", "correct": True, "duration_seconds": 7,
        }).status_code == 404
        approved = client.put(f"/api/ai/exercises/{item['id']}", json={
            **_payload(resource_id)["exercises"][0], "status": "approved",
        })
        assert approved.status_code == 200
        available = client.get("/api/learning/practice").json()
        assert len(available) == 1 and available[0]["attempt_count"] == 0
        assert client.post(f"/api/learning/practice/{item['id']}/attempt", json={
            "answer": "  ", "correct": False, "duration_seconds": 7,
        }).status_code == 422
        assert client.post(f"/api/learning/practice/{item['id']}/attempt", json={
            "answer": "Einmal", "correct": False, "duration_seconds": 7,
        }).status_code == 422
        first = client.post(f"/api/learning/practice/{item['id']}/attempt", json={
            "answer": "Einmal", "correct": False, "error_kind": "concept", "duration_seconds": 7,
        })
        assert first.status_code == 201, first.text
        second = client.post(f"/api/learning/practice/{item['id']}/attempt", json={
            "answer": "Wiederholung bis Bedingung falsch", "correct": True, "duration_seconds": 12,
        })
        assert second.status_code == 201, second.text
        assert first.json()["id"] != second.json()["id"]
        assert first.json()["topic"] == "schleifen"
        assert first.json()["solution_steps"] == "Bedingung prüfen, Block ausführen, erneut prüfen."
        assert client.get("/api/learning/practice").json()[0]["attempt_count"] == 2
        assert client.get("/api/learning/practice").json()[0]["last_correct"] is True
        history = client.get("/api/learning/practice/history").json()
        assert [attempt["answer"] for attempt in history] == [
            "Wiederholung bis Bedingung falsch", "Einmal",
        ]
        assert history[1]["error_kind"] == "concept"


def test_multiple_choice_is_checked_from_the_selected_answer(settings, factory, coordinator):
    _course_id, resource_id, _blocked_id = _material(factory)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        exercise = {**_payload(resource_id)["exercises"][0],
                    "choices": ["Einmal", "Bis die Bedingung falsch ist", "Nie"], "correct_choice": 1}
        invalid = client.post("/api/ai/exercises/import", json={**_payload(resource_id),
            "exercises": [{**exercise, "correct_choice": 9}]})
        assert invalid.status_code == 422
        created = client.post("/api/ai/exercises/import", json={**_payload(resource_id), "exercises": [exercise]})
        assert created.status_code == 201, created.text
        item_id = created.json()[0]["id"]
        assert client.put(f"/api/ai/exercises/{item_id}", json={**exercise, "status": "approved"}).status_code == 200
        listed = client.get("/api/learning/practice").json()[0]
        assert listed["choices"] == exercise["choices"]
        wrong = client.post(f"/api/learning/practice/{item_id}/attempt", json={
            "answer": "Einmal", "correct": True, "duration_seconds": 3})
        assert wrong.status_code == 201, wrong.text
        assert wrong.json()["correct"] is False
        assert wrong.json()["error_kind"] == "concept"
        assert client.post(f"/api/learning/practice/{item_id}/attempt", json={
            "answer": "Nicht enthalten", "correct": True, "duration_seconds": 3}).status_code == 422


def test_exercise_outbox_schema_and_mcp(settings, factory, coordinator):
    course_id, resource_id, _blocked_id = _material(factory)
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    payload = _payload(resource_id)
    outbox = settings.data_dir / "ai" / "outbox"
    outbox.mkdir(parents=True)
    raw = json.dumps(payload)
    (outbox / "uebungen.json").write_text(raw, encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    headers = {"X-UniOS-MCP-Token": "fixture-mcp-token"}
    with TestClient(app) as client:
        result = client.post("/api/ai/outbox/process")
        assert result.status_code == 200, result.text
        assert result.json()["exercises"] == 1
        assert result.json()["cards"] == 0
        assert client.get("/api/ai/exercises").json()[0]["status"] == "proposed"
        assert len(list((outbox / "processed").glob("*.json"))) == 1
        (outbox / "wiederholung.json").write_text(raw, encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["duplicates"] == 1
        assert len(client.get("/api/ai/exercises").json()) == 1
        mixed = {**payload, "cards": []}
        (outbox / "gemischt.json").write_text(json.dumps(mixed), encoding="utf-8")
        assert client.post("/api/ai/outbox/process").json()["rejected"] == 1
        assert len(list((outbox / "rejected").glob("*.error.txt"))) == 1
        assert client.post("/api/ai/mcp/exercises", json=payload).status_code == 403
        assert client.post("/api/ai/mcp/exercises", json=payload, headers=headers).json() == {
            "created": 1, "status": "proposed"}
        assert len(client.get("/api/ai/exercises").json()) == 2
        client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False})
        assert client.post("/api/ai/mcp/exercises", json=payload, headers=headers).status_code == 403
        assert any(item["tool"] == "submit_exercises" for item in client.get("/api/ai/mcp/audit").json())

    command = CliRunner().invoke(cli, ["schema", "all", "--json"])
    assert command.exit_code == 0, command.output
    schemas = json.loads(command.stdout)
    assert "cards" in schemas and "exercises" in schemas
    assert "exercises" in schemas["exercises"]["properties"]


def test_existing_outbox_receipt_survives_exercise_upgrade(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "d9a820f76c14")  # pragma: allowlist secret
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO ai_outbox_receipts "
                                "(sha256, imported_at, card_count) "
                                "VALUES (:sha256, :imported_at, :card_count)"),
                           {"sha256": "b" * 64, "imported_at": datetime.now(UTC), "card_count": 2})
    engine.dispose()

    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    with engine.connect() as connection:
        receipt = connection.execute(text("SELECT card_count, exercise_count FROM ai_outbox_receipts "
                                          "WHERE sha256 = :sha256"), {"sha256": "b" * 64}).one()
        assert receipt == (2, 0)
        assert connection.execute(text("SELECT COUNT(*) FROM exercise_proposal_queue")).scalar_one() == 0
    engine.dispose()
