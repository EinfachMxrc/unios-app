# SPDX-License-Identifier: AGPL-3.0-or-later

"""Optional connectors and Anki must not prevent the core API from starting."""

import sys

from fastapi.testclient import TestClient

from app.main import create_app


def test_missing_optional_components_leave_core_available(settings, factory, coordinator, monkeypatch):
    monkeypatch.setitem(sys.modules, "app.anki.study_api", None)
    settings = settings.model_copy(update={"connector_plugins": "not-installed"})
    app = create_app(settings, start_scheduler=False, coordinator=coordinator)
    client = TestClient(app)
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    states = {item["key"]: item["status"] for item in response.json()}
    assert states["core"] == "ready"
    assert states["anki"] == "unavailable"
    assert states["plugin:not-installed"] == "unavailable"
    assert client.get("/api/courses").status_code == 200


def test_university_services_lead_to_the_page_where_they_are_connected(settings, factory, coordinator):
    """A row that links to the page it is on does nothing; these three must open the setup."""
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        links = {item["key"]: item["href"] for item in client.get("/api/capabilities").json()}
    assert links["moodle"] == links["primuss"] == links["mycampus"] == "/setup"
