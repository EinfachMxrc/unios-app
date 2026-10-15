# SPDX-License-Identifier: AGPL-3.0-or-later

"""AI exports enforce course and group restrictions on the server."""

import json
from datetime import UTC, datetime
from io import BytesIO
from zipfile import ZipFile

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import (
    Course,
    MaterialAnnotation,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.main import create_app


def test_ai_package_respects_course_and_group_access(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        for number, group in ((1, "general"), (2, "other_group")):
            resource = Resource(source="fixture", source_key=f"r{number}", course_id=course.id,
                                kind="file", name=f"Material {number}", url="https://example.invalid/file",
                                group_category=group)
            session.add(resource)
            session.flush()
            version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                      relative_path=f"uni/material-{number}.txt", size=10,
                                      mime_type="text/plain", downloaded_at=datetime(2026, 1, 15, tzinfo=UTC))
            session.add(version)
            session.flush()
            if number == 1:
                allowed_version_id = version.id
            session.add(ResourceText(version_id=version.id, page_number=1,
                                     text=f"Inhalt {number}", markdown=f"Inhalt {number}"))
        session.commit()
        course_id, allowed_id, blocked_id = course.id, 1, 2

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        listed = client.get("/api/ai/package/resources", params={"course_id": course_id}).json()
        assert len(listed) == 1
        assert {key: listed[0][key] for key in ("id", "name", "version")} == {
            "id": allowed_id, "name": "Material 1", "version": 1}
        assert listed[0]["downloaded_at"].startswith("2026-01-15")
        assert client.get("/api/ai/package/resources", params={
            "course_id": course_id, "from_date": "2026-01-16"}).json() == []
        assert client.post("/api/ai/package", json={
            "course_id": course_id, "from_date": "2026-01-16"}).status_code == 422
        assert client.post("/api/ai/package", json={
            "course_id": course_id, "from_date": "2026-01-15", "to_date": "2026-01-14"}).status_code == 422
        response = client.post("/api/ai/package", json={"course_id": course_id})
        assert response.status_code == 200, response.text
        with ZipFile(BytesIO(response.content)) as package:
            names = package.namelist()
            assert f"materials/{allowed_id}-v1.md" in names
            assert f"materials/{blocked_id}-v1.md" not in names
            assert "Inhalt 1" in package.read(f"materials/{allowed_id}-v1.md").decode()
        assert len(list((settings.data_dir / "ai" / "inbox").glob("*.zip"))) == 1
        copied = client.post("/api/ai/package", json={"course_id": course_id, "output": "text",
                                                       "resource_ids": [allowed_id]})
        assert copied.status_code == 200, copied.text
        assert copied.headers["content-type"].startswith("text/plain")
        assert "Inhalt 1" in copied.text and "card_schema.json" in copied.text
        assert "Inhalt 2" not in copied.text
        assert len(list((settings.data_dir / "ai" / "inbox").glob("*.md"))) == 1
        assert client.post("/api/ai/package", json={"course_id": course_id,
                                                     "resource_ids": []}).status_code == 422
        assert client.post("/api/ai/package", json={
            "course_id": course_id, "mode": "questions"}).status_code == 422
        with factory() as session:
            session.add(MaterialAnnotation(
                id="00000000-0000-4000-8000-000000000001", resource_id=allowed_id,
                source_version_id=allowed_version_id, kind="question", quote="Inhalt 1",
                comment="Wie funktioniert das?", source_page=1,
            ))
            session.commit()
        journal = settings.data_dir / "annotations"
        journal.mkdir(parents=True, exist_ok=True)
        (journal / f"{allowed_id}.jsonl").write_text(json.dumps({
            "action": "create", "id": "00000000-0000-4000-8000-000000000001",
            "resource_id": allowed_id, "source_version_id": allowed_version_id,
            "source": "fixture", "source_key": "r1", "source_version": 1,
            "kind": "question", "quote": "Inhalt 1", "comment": "Wie funktioniert das?",
            "context_before": "Davor", "context_after": "Danach", "source_page": 1,
            "source_rects": [[0.1, 0.1, 0.2, 0.2]], "resolved": False, "revision": 1,
            "created_at": datetime.now(UTC).isoformat(), "updated_at": datetime.now(UTC).isoformat(),
        }) + "\n", encoding="utf-8")
        response = client.post("/api/ai/package", json={"course_id": course_id, "mode": "questions"})
        assert response.status_code == 200, response.text
        with ZipFile(BytesIO(response.content)) as package:
            assert "offene-fragen.md" in package.namelist()
            assert "card_schema.json" not in package.namelist()
            assert f"materials/{allowed_id}-v1.md" in package.namelist()
            assert "Wie funktioniert das?" in package.read("offene-fragen.md").decode()
            assert "Davor" in package.read("offene-fragen.md").decode()
        assert len(list((settings.data_dir / "ai" / "inbox").glob("*.zip"))) == 2
        assert client.put("/api/ai/access/category/learning_questions", json={
            "allowed": False}).status_code == 200
        assert client.post("/api/ai/package", json={
            "course_id": course_id, "mode": "questions"}).status_code == 403
        assert client.post("/api/ai/package", json={
            "course_id": course_id, "resource_ids": [blocked_id]}).status_code == 404
        with factory() as session:
            page = session.scalar(select(ResourceText).where(ResourceText.version_id == allowed_version_id))
            assert page is not None
            page.markdown = "A" * 100_001
            session.commit()
        assert client.post("/api/ai/package", json={"course_id": course_id,
                                                     "output": "text"}).status_code == 413
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False}).status_code == 200
        assert client.post("/api/ai/package", json={"course_id": course_id}).status_code == 403
        assert client.get("/api/ai/package/resources", params={"course_id": course_id}).status_code == 403
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": True}).status_code == 200
        assert client.put("/api/ai/access/category/course_material", json={"allowed": False}).status_code == 200
        assert client.post("/api/ai/package", json={"course_id": course_id}).status_code == 403


def test_period_package_spans_only_permitted_courses(settings, factory, coordinator):
    with factory() as session:
        ids = {}
        for number, (name, group, day) in enumerate((
            ("Freigegeben", "general", 15),
            ("Gesperrt", "general", 15),
            ("Fremdgruppe", "other_group", 15),
            ("Älter", "general", 10),
        ), start=1):
            course = Course(source="fixture", source_id=f"period-{number}", name=name)
            session.add(course)
            session.flush()
            resource = Resource(source="fixture", source_key=f"period-r{number}", course_id=course.id,
                                kind="file", name=f"Skript {name}", url="", group_category=group)
            session.add(resource)
            session.flush()
            version = ResourceVersion(resource_id=resource.id, version=1, sha256="c" * 64,
                                      relative_path=f"uni/period-{number}.txt", size=10,
                                      mime_type="text/plain", downloaded_at=datetime(2026, 1, day, tzinfo=UTC))
            session.add(version)
            session.flush()
            session.add(ResourceText(version_id=version.id, page_number=1, text=f"Text {name}", markdown=None))
            ids[name] = (course.id, resource.id)
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.put(f"/api/ai/access/course/{ids['Gesperrt'][0]}",
                          json={"allowed": False}).status_code == 200
        params = {"from_date": "2026-01-15", "to_date": "2026-01-15"}
        listed = client.get("/api/ai/package/resources", params=params)
        assert listed.status_code == 200, listed.text
        assert [item["id"] for item in listed.json()] == [ids["Freigegeben"][1]]
        assert client.post("/api/ai/package", json={"mode": "cards"}).status_code == 422
        assert client.post("/api/ai/package", json={**params,
            "resource_ids": [ids["Gesperrt"][1]]}).status_code == 404
        response = client.post("/api/ai/package", json={**params, "mode": "cards"})
        assert response.status_code == 200, response.text
        assert 'ki-cards-zeitraum.zip' in response.headers["content-disposition"]
        with ZipFile(BytesIO(response.content)) as package:
            manifest = json.loads(package.read("manifest.json"))
            assert manifest["scope"] == "period"
            assert manifest["courses"] == [{"id": ids["Freigegeben"][0], "name": "Freigegeben"}]
            assert [item["resource_id"] for item in manifest["resources"]] == [ids["Freigegeben"][1]]
            files = " ".join(package.namelist())
            assert f"materials/{ids['Freigegeben'][1]}-v1.md" in files
            assert "Text Freigegeben" in package.read(f"materials/{ids['Freigegeben'][1]}-v1.md").decode()
            assert "vermische keine Inhalte verschiedener Kurse" in package.read("anleitung.md").decode()
