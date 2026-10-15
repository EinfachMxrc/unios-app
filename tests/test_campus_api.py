# SPDX-License-Identifier: AGPL-3.0-or-later

"""The mycampus import is started from the app, runs in the background and lists what it found."""

import time
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.test_campus_import import BASE, FakePortal, site


@pytest.fixture
def campus(settings, factory, coordinator, monkeypatch):
    monkeypatch.setattr("app.portals.campus_import.REQUEST_PAUSE_SECONDS", 0)
    state = {"portal": FakePortal(site()), "signed_in": True}

    @contextmanager
    def open_reader(_base_url):
        if not state["signed_in"]:
            yield None
        else:
            yield state["portal"]

    monkeypatch.setattr("app.portals.campus_api.open_portal_reader", open_reader)
    monkeypatch.setattr("app.portals.campus_api.campus_base_url", lambda _settings: BASE + "/")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        yield client, state


def wait_until_finished(client) -> dict:
    # Several documents start isolated parsers. Wait for completion rather than
    # imposing a five-second foreground deadline on this background import.
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        status = client.get("/api/mycampus/import/status").json()
        if status["state"] != "running":
            return status
        time.sleep(0.05)
    raise AssertionError(f"import did not finish: {status}")


def test_programmes_can_be_listed_and_one_can_be_chosen(campus):
    client, _state = campus
    programs = client.get("/api/mycampus/programs").json()
    assert len(programs) == 9 and programs[0].keys() >= {"name", "url", "faculty", "degree"}
    assert client.get("/api/mycampus/program").json() is None
    chosen = next(item for item in programs if item["name"] == "Bachelor Informatik")
    assert client.post("/api/mycampus/program", json={"name": chosen["name"], "url": chosen["url"]}).status_code == 200
    assert client.get("/api/mycampus/program").json() == {"name": "Bachelor Informatik", "url": chosen["url"]}


def test_a_programme_address_outside_the_portal_is_refused(campus):
    client, _state = campus
    response = client.post("/api/mycampus/program", json={"name": "Böse", "url": "https://evil.example.com/x"})
    assert response.status_code == 400
    assert client.get("/api/mycampus/program").json() is None


def test_without_a_saved_sign_in_the_user_is_asked_to_sign_in(campus):
    client, state = campus
    state["signed_in"] = False
    assert client.get("/api/mycampus/programs").status_code == 409
    assert client.post("/api/mycampus/import").status_code == 409


def test_the_import_runs_in_the_background_and_its_results_are_listed(campus):
    client, _state = campus
    chosen = next(item for item in client.get("/api/mycampus/programs").json() if item["name"] == "Bachelor Informatik")
    client.post("/api/mycampus/program", json={"name": chosen["name"], "url": chosen["url"]})
    assert client.get("/api/mycampus/import/status").json()["state"] == "idle"
    assert client.post("/api/mycampus/import").status_code == 202
    status = wait_until_finished(client)
    assert status["state"] == "done"
    assert (status["report"]["events"], status["report"]["news"], status["report"]["documents"]) == (2, 1, 4)

    events = client.get("/api/mycampus/items", params={"kind": "event"}).json()
    assert [item["title"] for item in events] == [
        "Erstsemestertage MINT, Gesundheit, Wirtschaft", "AnCommen 2026 am Campus Design"]
    documents = client.get("/api/mycampus/items", params={"kind": "document"}).json()
    assert {item["category"] for item in documents} == {
        "Stundenplan", "Informationen zu Prüfungsangelegenheiten", "Modulhandbuch"}
    assert client.get("/api/mycampus/items", params={"kind": "bogus"}).status_code == 422
    assert len(client.get("/api/mycampus/items").json()) == 10


def test_a_failed_import_reports_why(campus):
    client, state = campus
    state["portal"] = FakePortal({})
    assert client.post("/api/mycampus/import").status_code == 202
    status = wait_until_finished(client)
    assert status["state"] == "error" and status["message"]


def test_documents_are_offered_with_their_stored_copy(campus):
    from tests.test_campus_documents import FILES

    client, state = campus
    state["portal"] = FakePortal(site(), FILES)
    assert client.post("/api/mycampus/import").status_code == 202
    assert wait_until_finished(client)["report"]["files_stored"] == 4
    documents = client.get("/api/mycampus/items", params={"kind": "document"}).json()
    assert len(documents) == 4 and all(item["material_id"] for item in documents)
    assert all(item["material_id"] is None for item in client.get("/api/mycampus/items", params={"kind": "event"}).json())
