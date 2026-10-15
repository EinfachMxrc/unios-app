# SPDX-License-Identifier: AGPL-3.0-or-later

"""A Moodle status check never submits anything and archives each file only once."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.connectors.base import ConnectorAuth
from app.db.models import Assignment, Course, Semester
from app.main import create_app
from app.submissions.service import archive_submission, parse_submission


def test_submission_check_and_immutable_archive(settings, factory, coordinator, monkeypatch):
    with factory() as session:
        semester = Semester(name="Testsemester")
        session.add(semester)
        session.flush()
        course = Course(source="moodle", source_id="101", name="Programmieren", semester_id=semester.id)
        session.add(course)
        session.flush()
        assignment = Assignment(source="moodle", source_key="101:701", course_id=course.id,
                                title="Schleifen üben", due_at=datetime(2026, 10, 1, tzinfo=UTC))
        session.add(assignment)
        session.commit()
        assignment_id = assignment.id

    payload = {"lastattempt": {"graded": False, "submission": {
        "id": 45, "status": "submitted", "timemodified": 1790000000,
        "plugins": [{"type": "file", "fileareas": [{"files": [{
            "filename": "Lösung.pdf", "fileurl": "https://moodle.example.invalid/pluginfile.php/45/Lösung.pdf",
            "filesize": 11,
        }]}]}],
    }}, "feedback": {}}
    calls = []

    class FakeMoodle:
        def __init__(self, _settings):
            self.client = SimpleNamespace(close=lambda: None)

        def check_auth(self):
            return ConnectorAuth("42", frozenset({"mod_assign_get_submission_status",
                                                  "mod_assign_get_assignments"}))

        def call(self, function, **parameters):
            calls.append((function, parameters))
            if function == "mod_assign_get_submission_status":
                return payload
            if function == "mod_assign_get_assignments":
                return {"courses": [{"id": 101, "assignments": [{"id": 701,
                         "duedate": 1790800000, "cutoffdate": 1790900000,
                         "submissiondrafts": True}]}]}
            raise AssertionError(function)

        def download(self, resource):
            assert resource.kind == "file" and resource.size == 11
            return b"fake-pdf-01"

    monkeypatch.setattr("app.submissions.api.MoodleClient", FakeMoodle)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get(f"/api/submissions/{assignment_id}").json() is None
        first = client.post(f"/api/submissions/{assignment_id}/check")
        assert first.status_code == 200, first.text
        assert first.json()["status"] == "submitted"
        assert first.json()["archive_files"] == 1
        assert first.json()["cutoff_at"] is not None
        second = client.post(f"/api/submissions/{assignment_id}/check")
        assert second.status_code == 200 and second.json()["archive_files"] == 1
        assert client.get(f"/api/submissions/{assignment_id}").json()["status"] == "submitted"
        assert all(function in {"mod_assign_get_submission_status", "mod_assign_get_assignments"}
                   for function, _parameters in calls)

    manifests = list((settings.data_dir / "uni").rglob("manifest.json"))
    assert len(manifests) == 1
    manifest = json.loads(manifests[0].read_text(encoding="utf-8"))
    assert manifest["files"][0]["name"].endswith("Lösung.pdf")
    assert (manifests[0].parent / manifest["files"][0]["name"]).read_bytes() == b"fake-pdf-01"
    assert len(list((settings.data_dir / "submissions" / str(assignment_id)).glob("check-*.json"))) == 2


def test_draft_and_unexpected_moodle_status_stay_honest(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="moodle", source_id="101", name="Programmieren")
        session.add(course)
        session.flush()
        assignment = Assignment(source="moodle", source_key="101:701", course_id=course.id,
                                title="Schleifen üben")
        session.add(assignment)
        session.commit()
        draft, _ = parse_submission(assignment, {"lastattempt": {
            "submission": {"status": "draft"}}}, {"submissiondrafts": True})
        assert draft.status == "draft" and "Entwurf" in draft.warning
        unclear, _ = parse_submission(assignment, {"lastattempt": {
            "submission": {"status": "surprise"}}})
        assert unclear.status == "unclear"


def _fixture_archive(factory):
    with factory() as session:
        semester = Semester(name="Testsemester")
        session.add(semester)
        session.flush()
        course = Course(source="moodle", source_id="101", name="Programmieren", semester_id=semester.id)
        session.add(course)
        session.flush()
        assignment = Assignment(source="moodle", source_key="101:701", course_id=course.id,
                                title="Schleifen üben")
        session.add(assignment)
        session.commit()
        return assignment, course, semester


class _FakeDownloadClient:
    def download(self, _resource):
        return b"fake-pdf-content"


_SUBMISSION = {"id": 45, "status": "submitted", "timemodified": 1790000000,
              "plugins": [{"type": "file", "fileareas": [{"files": [{
                  "filename": "Loesung.pdf",
                  "fileurl": "https://moodle.example.invalid/pluginfile.php/45/Loesung.pdf",
                  "filesize": 16}]}]}]}


def test_archive_skips_timestamp_when_tsa_not_configured(settings, factory):
    assignment, course, semester = _fixture_archive(factory)
    assert settings.submission_tsa_url == ""
    result = archive_submission(settings, _FakeDownloadClient(), assignment, course, semester,
                                _SUBMISSION, "submitted")
    assert result.file_count == 1
    assert result.timestamp_status is None
    folder = next((settings.data_dir / "uni").rglob("manifest.json")).parent
    assert not (folder / "timestamp.json").exists()
    assert not (folder / "manifest.json.tsr").exists()


def test_archive_records_a_working_timestamp(monkeypatch, settings, factory):
    assignment, course, semester = _fixture_archive(factory)
    settings.submission_tsa_url = "https://tsa.example.invalid/"
    monkeypatch.setattr("app.submissions.timestamp.request_timestamp",
                        lambda url, data: b"fake-der-timestamp-token")
    result = archive_submission(settings, _FakeDownloadClient(), assignment, course, semester,
                                _SUBMISSION, "submitted")
    assert result.timestamp_status["status"] == "ok"
    folder = next((settings.data_dir / "uni").rglob("manifest.json")).parent
    assert (folder / "manifest.json.tsr").read_bytes() == b"fake-der-timestamp-token"
    status = json.loads((folder / "timestamp.json").read_text(encoding="utf-8"))
    assert status["status"] == "ok" and status["tsa_url"] == settings.submission_tsa_url


def test_archive_records_a_failed_timestamp_without_blocking_the_archive(monkeypatch, settings, factory):
    assignment, course, semester = _fixture_archive(factory)
    settings.submission_tsa_url = "https://tsa.example.invalid/"

    def _boom(url, data):
        raise ConnectionError("TSA nicht erreichbar")

    monkeypatch.setattr("app.submissions.timestamp.request_timestamp", _boom)
    result = archive_submission(settings, _FakeDownloadClient(), assignment, course, semester,
                                _SUBMISSION, "submitted")
    assert result.file_count == 1
    assert result.timestamp_status["status"] == "failed"
    folder = next((settings.data_dir / "uni").rglob("manifest.json")).parent
    assert not (folder / "manifest.json.tsr").exists()
    status = json.loads((folder / "timestamp.json").read_text(encoding="utf-8"))
    assert status["status"] == "failed" and "TSA nicht erreichbar" in status["error"]
