# SPDX-License-Identifier: AGPL-3.0-or-later

"""Own files are imported without changing the drop originals."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from app.db.models import (
    Base,
    Course,
    CourseSection,
    Resource,
    ResourceText,
    ResourceVersion,
    Semester,
)
from app.db.session import make_session_factory
from app.files.sidecars import rebuild_index
from app.main import create_app


def _course(factory):
    with factory() as session:
        semester = Semester(name="Wintersemester", is_current=True)
        session.add(semester)
        session.flush()
        course = Course(source="moodle", source_id="42", name="Algebra", semester_id=semester.id)
        session.add(course)
        session.flush()
        section = CourseSection(course_id=course.id, source_id="exercise", name="Übungen", position=1)
        session.add(section)
        session.commit()
        return course.id, section.id


def test_drop_import_versioning_search_and_rebuild(settings, factory, coordinator, tmp_path):
    course_id, section_id = _course(factory)
    folder = settings.data_dir / "drop"
    folder.mkdir(parents=True)
    original = folder / "Fragen.txt"
    original.write_text("Warum gilt die Formel?", encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        files = client.get("/api/drop").json()["files"]
        assert files[0]["name"] == "Fragen.txt" and not files[0]["imported"]
        payload = {"course_id": course_id, "section_id": section_id}
        first = client.post("/api/drop/Fragen.txt/assign", json=payload)
        assert first.status_code == 200, first.text
        assert first.json()["version"] == 1 and first.json()["created_version"]
        assert client.get("/api/drop").json()["files"][0]["imported"]
        second = client.post("/api/drop/Fragen.txt/assign", json=payload)
        assert second.status_code == 200 and not second.json()["created_version"]
        assert second.json()["version_id"] == first.json()["version_id"]
        original.write_text("Warum gilt die neue Formel?", encoding="utf-8")
        assert not client.get("/api/drop").json()["files"][0]["imported"]
        third = client.post("/api/drop/Fragen.txt/assign", json=payload)
        assert third.status_code == 200 and third.json()["version"] == 2
    with factory() as session:
        resource = session.scalar(select(Resource).where(Resource.source == "manual"))
        assert resource is not None and resource.course_id == course_id and resource.section_id == section_id
        versions = session.scalars(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                                   .order_by(ResourceVersion.version)).all()
        assert len(versions) == 2
        assert (settings.data_dir / versions[0].relative_path).read_text() == "Warum gilt die Formel?"
        assert (settings.data_dir / versions[1].relative_path).read_text() == "Warum gilt die neue Formel?"
        texts = session.scalars(select(ResourceText).where(ResourceText.version_id == versions[1].id)).all()
        assert texts[0].text == "Warum gilt die neue Formel?"
    assert original.read_text() == "Warum gilt die neue Formel?"

    rebuilt_engine = create_engine(f"sqlite:///{tmp_path / 'rebuilt.sqlite3'}")
    Base.metadata.create_all(rebuilt_engine)
    rebuilt_factory = make_session_factory(rebuilt_engine)
    assert rebuild_index(rebuilt_factory, settings.data_dir)["versions_created"] == 2
    with rebuilt_factory() as session:
        restored_course = session.scalar(select(Course).where(Course.source == "moodle", Course.source_id == "42"))
        restored_resource = session.scalar(select(Resource).where(Resource.source == "manual"))
        assert restored_course is not None and restored_resource is not None
        assert restored_resource.course_id == restored_course.id
        assert restored_resource.section_id is not None
    rebuilt_engine.dispose()


def test_drop_rejects_wrong_section_symlink_and_cross_site(settings, factory, coordinator):
    course_id, _ = _course(factory)
    folder = settings.data_dir / "drop"
    folder.mkdir(parents=True)
    (folder / "safe.txt").write_text("Eigenes Material", encoding="utf-8")
    try:
        (folder / "shortcut.txt").symlink_to(folder / "safe.txt")
        symlink_supported = True
    except (OSError, NotImplementedError):
        symlink_supported = False
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert [item["name"] for item in client.get("/api/drop").json()["files"]] == ["safe.txt"]
        if symlink_supported:
            assert client.post("/api/drop/shortcut.txt/assign", json={"course_id": course_id}).status_code == 400
        assert client.post("/api/drop/safe.txt/assign", json={"course_id": course_id,
                                                             "section_id": 999}).status_code == 400
        assert client.post("/api/drop/safe.txt/assign", json={"course_id": 999}).status_code == 404
        assert client.post("/api/drop/safe.txt/assign", json={"course_id": course_id},
                           headers={"origin": "https://example.invalid"}).status_code == 403
