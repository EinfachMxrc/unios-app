# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from app.connectors.base import (
    ConnectorAuth,
    ConnectorStatus,
    RemoteCourse,
    RemoteResource,
    RemoteSection,
    Snapshot,
)
from app.db.models import (
    Base,
    Course,
    CourseSection,
    Resource,
    SectionGroupAssignment,
    Semester,
)
from app.db.session import make_session_factory
from app.files.sidecars import rebuild_index
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from app.sync.groups import suggest_group_status
from tests.test_moodle_sync import FixtureMoodle


class GroupConnector:
    name = "fixture-platform"

    def __init__(self):
        self.downloads = 0
        self.course = RemoteCourse(
            key="101", name="Mathe", own_group_names=["Müller"],
            sections=[RemoteSection("1", "Gruppe Müller", 1), RemoteSection("2", "Gruppe Schmidt", 2)],
            resources=[RemoteResource("own", "Eigene.txt", "https://moodle.example/own", "file", "1"),
                       RemoteResource("other", "Fremde.txt", "https://moodle.example/other", "file", "2")],
        )

    def fetch_changes(self, since=None):
        return Snapshot([self.course])

    def check_auth(self):
        return ConnectorAuth("fixture-user")

    def list_courses(self):
        return [self.course]

    def health(self):
        return ConnectorStatus("ok")

    def download(self, resource):
        self.downloads += 1
        return resource.key.encode()


def test_group_suggestions_are_conservative():
    assert suggest_group_status("Allgemeines", ["Müller"]) is None
    assert suggest_group_status("Gruppe Müller", ["Müller"]) == "own_group"
    assert suggest_group_status("Gruppe Schmidt", ["Müller"]) == "other_group"
    assert suggest_group_status("Gruppe Schmidt", []) == "unassigned"


def test_group_sync_question_and_download_opt_out(settings, factory, coordinator):
    connector = GroupConnector()
    assert connector.check_auth().account_id == "fixture-user"
    assert connector.list_courses()[0].name == "Mathe"
    assert connector.health().status == "ok"
    engine = SyncEngine(factory, settings, [connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    assert connector.downloads == 2
    with factory() as session:
        course = session.scalar(select(Course))
        assignments = session.scalars(select(SectionGroupAssignment)).all()
        assert len(assignments) == 2
        assert all(item.needs_confirmation for item in assignments)
        assert {item.group_category for item in session.scalars(select(Resource)).all()} == {"own_group", "other_group"}
        course_id = course.id
    with TestClient(create_app(settings, connectors=[connector], start_scheduler=False, coordinator=coordinator)) as client:
        overview = client.get("/api/overview").json()
        assert overview["new_files"] == 1
        assert len(overview["pending_group_courses"]) == 1
        detail = client.get(f"/api/courses/{course_id}").json()
        other_section = next(item for item in detail["sections"] if item["name"] == "Gruppe Schmidt")
        assert client.post(f"/api/courses/{course_id}/sections/{other_section['id']}/group",
                           json={"status": "other_group"}).status_code == 200
        assert client.post(f"/api/courses/{course_id}/group-download",
                           json={"download_other_groups": False}).status_code == 200
        assert client.post(f"/api/courses/{course_id}/sections/999/group",
                           json={"status": "other_group"}).status_code == 404
    assert engine.run().status == "success"
    assert connector.downloads == 2
    connector.course.sections.append(RemoteSection("3", "Gruppe Weber", 3))
    connector.course.resources.append(RemoteResource("third", "NochFremd.txt", "https://moodle.example/third", "file", "3"))
    assert engine.run().status == "success"
    assert connector.downloads == 2
    with factory() as session:
        assert session.scalar(select(Resource).where(Resource.source_key == "third")) is None
        assert len(session.scalars(select(SectionGroupAssignment).where(SectionGroupAssignment.needs_confirmation.is_(True))).all()) == 2


def test_moodle_skips_user_invisible_modules(settings):
    moodle = FixtureMoodle(settings)
    moodle.contents[101][0]["modules"][0]["uservisible"] = False
    snapshot = moodle.connector.fetch_changes()
    course = next(item for item in snapshot.courses if item.key == "101")
    assert all(item.name != "04_Schleifen.pdf" for item in course.resources)


def test_dashboard_course_settings_survive_sidecar_rebuild(settings, factory, coordinator, tmp_path):
    connector = GroupConnector()
    engine = SyncEngine(factory, settings, [connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    with factory() as session:
        course = session.scalar(select(Course))
        sections = {item.name: item.id for item in session.scalars(select(CourseSection)
                    .where(CourseSection.course_id == course.id)).all()}
        semester = Semester(name="Wintersemester 2026/27", is_current=False)
        session.add(semester)
        session.commit()
        course_id, semester_id = course.id, semester.id
    with TestClient(create_app(settings, connectors=[connector], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.post(f"/api/courses/{course_id}/sections/{sections['Gruppe Müller']}/group",
                           json={"status": "general"}).status_code == 200
        assert client.post(f"/api/courses/{course_id}/sections/{sections['Gruppe Schmidt']}/group",
                           json={"status": "own_group"}).status_code == 200
        assert client.post(f"/api/courses/{course_id}/group-download",
                           json={"download_other_groups": False}).status_code == 200
        assert client.post(f"/api/courses/{course_id}/semester",
                           json={"semester_id": semester_id}).status_code == 200

    replacement = create_engine(f"sqlite:///{tmp_path / 'restored.sqlite3'}")
    Base.metadata.create_all(replacement)
    restored_factory = make_session_factory(replacement)
    assert rebuild_index(restored_factory, settings.data_dir)["versions_created"] == 2
    with restored_factory() as session:
        restored_course = session.scalar(select(Course))
        assert session.get(Semester, restored_course.semester_id).name == "Wintersemester 2026/27"
        assert restored_course.download_other_groups is False
        assert {item.name: item.group_category for item in session.scalars(select(Resource)).all()} == {
            "Eigene.txt": "general", "Fremde.txt": "own_group",
        }
        assignments = session.scalars(select(SectionGroupAssignment)).all()
        assert {session.get(CourseSection, item.section_id).name: item.status for item in assignments} == {
            "Gruppe Müller": "general", "Gruppe Schmidt": "own_group",
        }
        assert all(not item.needs_confirmation for item in assignments)
    replacement.dispose()
