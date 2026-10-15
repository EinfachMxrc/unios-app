# SPDX-License-Identifier: AGPL-3.0-or-later

import time

import pymupdf
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import AiAccess, Course, Resource, ResourceText, ResourceVersion
from app.extract.jobs import IndexJob, IndexJobs
from app.main import create_app


def seed(factory, settings, pages=3):
    path = settings.data_dir / "uni" / "fictional.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as pdf:
        for number in range(pages):
            page = pdf.new_page()
            page.insert_text((50, 50), f"Fictional page {number + 1}")
        pdf.save(path)
    with factory() as session:
        course = Course(source="fixture", source_id="actions", name="Fictional course")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="actions", name="Fictional PDF",
                            course_id=course.id, kind="file", url="https://example.invalid/pdf")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/fictional.pdf", size=path.stat().st_size, mime_type="application/pdf")
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=1, text="Original index"))
        session.commit()
        return course.id, resource.id, version.id


def test_actions_validate_preview_confirm_and_reject_stale_input(settings, factory, coordinator):
    course_id, _, _ = seed(factory, settings)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    path = f"/api/entities/course/{course_id}/actions/course.set_activity"
    payload = {"input": {"active": False, "expected": True}}
    with TestClient(app) as client:
        assert client.post(path, json={**payload, "dry_run": True}).json()["dry_run"]
        assert client.post(path, json=payload).status_code == 409
        assert client.get(path).status_code == 405
        assert client.post(path, json={"input": {"extra": True}, "confirmed": True}).status_code == 422
        assert client.post(path, json={**payload, "confirmed": True}).json()["result"] == {"active": False}
        assert client.post(path, json={**payload, "confirmed": True}).status_code == 409
        assert client.post(path.replace("course.set_activity", "resource.reextract"), json=payload).status_code == 404


def test_background_indexes_500_pages_and_keeps_original(settings, factory, coordinator):
    _, resource_id, version_id = seed(factory, settings, pages=500)
    jobs = IndexJobs(factory, settings, coordinator)
    before = (settings.data_dir / "uni" / "fictional.pdf").read_bytes()
    try:
        jobs.submit(resource_id)
        deadline = time.monotonic() + 15
        while jobs.status(resource_id)["state"] in {"queued", "running"} and time.monotonic() < deadline:
            time.sleep(0.02)
        assert jobs.status(resource_id)["state"] == "completed"
        assert jobs.status(resource_id)["completed"] == 500
        with factory() as session:
            indexed = session.scalars(select(ResourceText).where(ResourceText.version_id == version_id)).all()
            assert len(indexed) == 500
        assert (settings.data_dir / "uni" / "fictional.pdf").read_bytes() == before
    finally:
        jobs.close()


def test_cancel_before_publish_preserves_index(settings, factory, coordinator, monkeypatch):
    _, resource_id, version_id = seed(factory, settings)
    jobs = IndexJobs(factory, settings, coordinator)
    job = IndexJob(version_id, generation=coordinator.current().generation)
    monkeypatch.setattr("app.extract.jobs.stage_document_date", lambda *args: job.cancel.set())
    jobs._index(job)
    assert job.state == "cancelled"
    with factory() as session:
        rows = session.scalars(select(ResourceText).where(ResourceText.version_id == version_id)).all()
        assert len(rows) == 1 and rows[0].text == "Original index"
    assert jobs.latest(resource_id).id == version_id


def test_old_generation_cannot_publish_an_index(settings, factory, coordinator):
    _, _, version_id = seed(factory, settings)
    jobs = IndexJobs(factory, settings, coordinator)
    job = IndexJob(version_id, generation=coordinator.current().generation - 1)
    with pytest.raises(RuntimeError, match="Generation"):
        jobs._index(job)
    with factory() as session:
        assert session.scalar(select(ResourceText.text).where(ResourceText.version_id == version_id)) == "Original index"


def test_mcp_actions_respect_grants_and_cannot_mutate(settings, factory, coordinator):
    course_id, resource_id, _ = seed(factory, settings)
    settings.mcp_enabled, settings.mcp_token = True, "fictional-token"
    headers = {"X-UniOS-MCP-Token": settings.mcp_token}
    path = f"/api/ai/mcp/entities/resource/{resource_id}/actions/"
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.post(path + "resource.index_status", json={}, headers=headers).status_code == 200
        assert client.post(path + "resource.reextract", json={"confirmed": True}, headers=headers).status_code == 403
        with factory() as session:
            session.get(Resource, resource_id).group_category = "other_group"
            session.commit()
        assert client.post(path + "resource.index_status", json={}, headers=headers).status_code == 403
        with factory() as session:
            session.get(Resource, resource_id).group_category = "general"
            session.add(AiAccess(key=f"course:{course_id}", allowed=False))
            session.commit()
        assert client.post(path + "resource.index_status", json={}, headers=headers).status_code == 403
