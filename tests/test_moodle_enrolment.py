# SPDX-License-Identifier: AGPL-3.0-or-later
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.connectors.moodle.client import MoodleClient, MoodleError
from app.courses.enrolment_api import enrolment_router
from app.courses.enrolment_service import EnrolmentService
from app.host.actions import _scrub


def connector(settings, *, supported=True, result=True):
    calls = []
    functions = ["core_enrol_get_users_courses", "core_course_get_contents"]
    if supported:
        functions += ["core_course_search_courses", "core_enrol_get_course_enrolment_methods",
                      "enrol_self_get_instance_info", "enrol_self_enrol_user"]

    def request(function, params):
        calls.append((function, params))
        if function == "core_webservice_get_site_info":
            return {"userid": 7, "functions": [{"name": name} for name in functions]}
        if function == "core_enrol_get_users_courses":
            return []
        if function == "core_course_search_courses":
            return {"total": 1, "courses": [{"id": 101, "fullname": "Testkurs",
                     "summary": '<p>Einschreibeschlüssel: beispiel-key</p><script>untrusted()</script>',
                     "categoryname": "Testsemester"}]}
        if function == "core_enrol_get_course_enrolment_methods":
            return [{"id": 9, "type": "self"}]
        if function == "enrol_self_get_instance_info":
            return {"id": 9, "courseid": 101, "name": "Studierende", "status": "1", "enrolpassword": "Schlüssel"}
        if function == "enrol_self_enrol_user":
            return {"status": result, "warnings": []}
        raise AssertionError(function)

    return MoodleClient(settings, request=request), calls


def test_search_is_readonly_and_enrolment_requires_confirmation_and_matching_method(settings, coordinator):
    client, calls = connector(settings)
    app = FastAPI()
    app.include_router(enrolment_router([client], coordinator, SimpleNamespace(run=lambda **_: SimpleNamespace(status="success"))))
    http = TestClient(app)
    result = http.get("/api/moodle/courses/search?q=test").json()
    assert result["courses"][0]["description"] == "Einschreibeschlüssel: beispiel-key"
    assert not any(name == "enrol_self_enrol_user" for name, _ in calls)
    endpoint = "/api/moodle/courses/101/enrolment"
    assert http.post(endpoint, json={"instance_id": 9, "key": "example"}).status_code == 422
    assert http.post(endpoint, json={"instance_id": 10, "key": "example", "confirmed": True}).status_code == 502
    assert not any(name == "enrol_self_enrol_user" for name, _ in calls)
    response = http.post(endpoint, json={"instance_id": 9, "key": "example", "confirmed": True})
    assert response.json() == {"enrolled": True, "sync_status": "success"}
    assert [(name, params) for name, params in calls if name == "enrol_self_enrol_user"] == [
        ("enrol_self_enrol_user", {"courseid": 101, "instanceid": 9, "password": "example"})]
    assert _scrub({"key": "example", "html": '<input value="session-secret">'}) == {"key": "[geschützt]", "html": "[geschützt]"}


def test_unsupported_service_has_browser_fallback_and_cannot_write(settings, coordinator):
    client, calls = connector(settings, supported=False)
    service = EnrolmentService([client], coordinator)
    result = service.search("Testkurs", 0)
    assert not result["available"] and "/course/search.php?search=Testkurs" in result["search_url"]
    assert not service.methods(101)["available"]
    with pytest.raises(MoodleError, match="nicht verfügbar"):
        service.enrol(101, 9, "example")
    assert not any(name == "enrol_self_enrol_user" for name, _ in calls)


def test_rejected_remote_enrolment_is_not_success(settings, coordinator):
    client, _ = connector(settings, result=False)
    with pytest.raises(MoodleError, match="nicht bestätigt"):
        EnrolmentService([client], coordinator).enrol(101, 9, "wrong-example")
