# SPDX-License-Identifier: AGPL-3.0-or-later

"""The optional Moodle write flow requires a fresh, explicit human confirmation."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.connectors.base import ConnectorAuth
from app.connectors.moodle.client import MoodleClient, MoodleError
from app.db.models import Assignment, Course, SubmissionAttempt
from app.main import create_app


def _assignment(factory):
    with factory() as session:
        course = Course(source="moodle", source_id="101", name="Erfundener Kurs")
        session.add(course)
        session.flush()
        assignment = Assignment(source="moodle", source_key="101:701", course_id=course.id,
                                title="Erfundene Aufgabe", url="https://moodle.example.invalid/mod/assign/view.php?id=701",
                                due_at=datetime.now(UTC) + timedelta(days=2))
        session.add(assignment)
        session.commit()
        return assignment.id


def _fake_moodle(*, wrong_download: bool = False, upload_fails: bool = False,
                 existing_draft: bool = False):
    calls: list[str] = []
    state = {"submitted": False, "saved": existing_draft}
    content = b"Entirely fictional submission file."

    class FakeMoodle:
        def __init__(self, _settings):
            self.client = SimpleNamespace(close=lambda: None)

        def check_auth(self):
            return ConnectorAuth("42", frozenset({
                "mod_assign_get_assignments", "mod_assign_get_submission_status",
                "mod_assign_save_submission", "mod_assign_submit_for_grading",
            }))

        def call(self, function, **parameters):
            calls.append(function)
            if function == "mod_assign_get_assignments":
                return {"courses": [{"id": 101, "assignments": [{
                    "id": 701, "submissiondrafts": 1, "requiresubmissionstatement": 1,
                    "submissionstatement": "Dies ist meine eigene Arbeit.",
                    "duedate": int((datetime.now(UTC) + timedelta(days=2)).timestamp()),
                    "cutoffdate": int((datetime.now(UTC) + timedelta(days=3)).timestamp()),
                    "configs": [
                        {"plugin": "file", "subtype": "assignsubmission", "name": "enabled", "value": "1"},
                        {"plugin": "file", "subtype": "assignsubmission", "name": "maxfilesubmissions", "value": "2"},
                        {"plugin": "file", "subtype": "assignsubmission", "name": "maxsubmissionsizebytes", "value": "100000"},
                        {"plugin": "file", "subtype": "assignsubmission", "name": "filetypeslist", "value": ".pdf,.zip"},
                    ],
                }]}]}
            if function == "mod_assign_get_submission_status":
                if not state["saved"]:
                    return {"lastattempt": {"submission": {"id": 45, "status": "new", "timemodified": 1}}}
                return {"lastattempt": {"submission": {
                    "id": 45, "status": "submitted" if state["submitted"] else "draft",
                    "timemodified": 1790000000, "plugins": [{"type": "file", "fileareas": [{"files": [{
                        "filename": "answer.pdf", "filesize": len(content),
                        "fileurl": "https://moodle.example.invalid/pluginfile.php/45/answer.pdf",
                    }]}]}],
                }}}
            if function == "mod_assign_save_submission":
                assert parameters["plugindata[files_filemanager]"] == 99
                state["saved"] = True
                return {"warnings": []}
            if function == "mod_assign_submit_for_grading":
                assert parameters["acceptsubmissionstatement"] == 1
                state["submitted"] = True
                return {"warnings": []}
            raise AssertionError(function)

        def upload_draft(self, name, data, item_id=0):
            calls.append("upload_draft")
            assert name == "answer.pdf" and data == content and item_id == 0
            if upload_fails:
                raise MoodleError("Erfundener Uploadfehler")
            return 99

        def download(self, resource):
            calls.append("download")
            return b"not the selected file" if wrong_download else content

    return FakeMoodle, calls, content


def test_explicit_submission_succeeds_once_and_archives_verified_file(settings, factory, coordinator, monkeypatch):
    assignment_id = _assignment(factory)
    fake, calls, content = _fake_moodle()
    monkeypatch.setattr("app.submissions.api.MoodleClient", fake)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/submissions/control").json() == {"enabled": False}
        blocked = client.post(f"/api/submissions/{assignment_id}/prepare",
                              data={"final_submit": "true"}, files={"files": ("answer.pdf", content)})
        assert blocked.status_code == 403
        assert calls == []
        assert client.put("/api/submissions/control", json={"enabled": True}).status_code == 200
        rejected_type = client.post(f"/api/submissions/{assignment_id}/prepare",
                                    data={"final_submit": "true"}, files={"files": ("answer.exe", content)})
        assert rejected_type.status_code == 422
        prepared = client.post(f"/api/submissions/{assignment_id}/prepare",
                               data={"final_submit": "true"}, files={"files": ("answer.pdf", content)})
        assert prepared.status_code == 200, prepared.text
        preview = prepared.json()
        assert preview["state"] == "prepared" and preview["statement_required"]
        assert preview["statement_text"] == "Dies ist meine eigene Arbeit."
        assert preview["files"][0]["size"] == len(content)
        assert "upload_draft" not in calls
        path = f"/api/submissions/{assignment_id}/confirm"
        assert client.post(path, json={"attempt_id": preview["id"], "confirmed": False}).status_code == 422
        assert client.post(path, json={"attempt_id": preview["id"], "confirmed": True}).status_code == 422
        assert "upload_draft" not in calls
        confirmed = client.post(path, json={"attempt_id": preview["id"], "confirmed": True,
                                            "accept_statement": True})
        assert confirmed.status_code == 200, confirmed.text
        assert confirmed.json()["state"] == "completed"
        assert confirmed.json()["result_status"] == "submitted"
        assert client.post(path, json={"attempt_id": preview["id"], "confirmed": True,
                                       "accept_statement": True}).status_code == 409
        assert calls.count("upload_draft") == 1
        assert client.get(f"/api/submissions/{assignment_id}").json()["archive_files"] == 1
        assert client.get(f"/api/submissions/{assignment_id}/attempts/latest").json()["id"] == preview["id"]
    with factory() as session:
        attempt = session.get(SubmissionAttempt, preview["id"])
        assert attempt is not None and attempt.state == "completed"
    assert len(list((settings.data_dir / "uni").rglob("manifest.json"))) == 1


@pytest.mark.parametrize("failure", ["upload", "mismatch"])
def test_upload_failure_is_recorded_and_never_retried(settings, factory, coordinator, monkeypatch, failure):
    assignment_id = _assignment(factory)
    fake, calls, content = _fake_moodle(upload_fails=failure == "upload",
                                       wrong_download=failure == "mismatch")
    monkeypatch.setattr("app.submissions.api.MoodleClient", fake)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        client.put("/api/submissions/control", json={"enabled": True})
        preview = client.post(f"/api/submissions/{assignment_id}/prepare",
                              data={"final_submit": "true"}, files={"files": ("answer.pdf", content)}).json()
        path = f"/api/submissions/{assignment_id}/confirm"
        result = client.post(path, json={"attempt_id": preview["id"], "confirmed": True,
                                         "accept_statement": True})
        assert result.status_code == 200
        assert result.json()["state"] == "unclear"
        assert "direkt in Moodle prüfen" in result.json()["warning"]
        assert client.post(path, json={"attempt_id": preview["id"], "confirmed": True,
                                       "accept_statement": True}).status_code == 409
        assert calls.count("upload_draft") == 1
    with factory() as session:
        attempts = session.scalars(select(SubmissionAttempt)).all()
        assert len(attempts) == 1 and attempts[0].state == "unclear"


def test_moodle_draft_upload_keeps_token_out_of_url(settings):
    observed = []

    def reply(request: httpx.Request) -> httpx.Response:
        observed.append(request)
        assert request.url.path == "/webservice/upload.php"
        assert b"fixture-token" not in request.url.raw_path
        assert b"fixture-token" in request.content
        return httpx.Response(200, json=[{"filename": "answer.pdf", "itemid": 99}])

    transport = httpx.MockTransport(reply)
    with httpx.Client(transport=transport) as http:
        client = MoodleClient(settings, client=http, request=lambda *_: {})
        assert client.upload_draft("answer.pdf", b"fictional") == 99
        assert len(observed) == 1


def test_existing_draft_needs_separate_replacement_confirmation(settings, factory, coordinator, monkeypatch):
    assignment_id = _assignment(factory)
    fake, calls, content = _fake_moodle(existing_draft=True)
    monkeypatch.setattr("app.submissions.api.MoodleClient", fake)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        control = client.get("/api/submissions/control")
        assert control.headers["cache-control"] == "private, no-store"
        assert client.put("/api/submissions/control", json={"enabled": True}).status_code == 200
        prepared = client.post(f"/api/submissions/{assignment_id}/prepare",
                               data={"final_submit": "true"}, files={"files": ("answer.pdf", content)})
        assert prepared.status_code == 200, prepared.text
        preview = prepared.json()
        assert preview["existing_status"] == "draft"
        confirm = f"/api/submissions/{assignment_id}/confirm"
        consent = {"attempt_id": preview["id"], "confirmed": True, "accept_statement": True}
        assert client.post(confirm, json=consent).status_code == 422
        assert "upload_draft" not in calls
        result = client.post(confirm, json={**consent, "replace_existing": True})
        assert result.status_code == 200 and result.json()["state"] == "completed"
        assert calls.count("upload_draft") == 1
