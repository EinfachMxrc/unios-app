# SPDX-License-Identifier: AGPL-3.0-or-later

"""The first-run assistant verifies Moodle before enabling the dashboard."""

import base64
import hashlib
import json

from fastapi.testclient import TestClient

from app.main import create_app
from app.portals.campus_import import save_program_choice
from app.setup import protocol_handler


def test_setup_connects_moodle_and_finishes_without_echoing_token(settings, factory, coordinator, monkeypatch):
    from app.db.models import ConnectorHealth

    with factory() as session:
        session.add(ConnectorHealth(connector="moodle", status="error", message="Moodle-Token erneuern",
                                    consecutive_failures=3))
        session.commit()
    settings.moodle_token = ""
    marker = settings.local_dir / "setup.json"
    marker.write_text('{"version":1,"institution":null,"notifications":null,"completed":false}', encoding="utf-8")
    saved = []

    class FakeMoodle:
        name = "moodle"

        def __init__(self, candidate):
            assert candidate.moodle_token == "invented-token"

        def call(self, function):
            assert function == "core_webservice_get_site_info"
            return {"userid": 123}

    monkeypatch.setattr("app.setup.api.MoodleClient", FakeMoodle)
    monkeypatch.setattr("app.setup.api.save_moodle_token", lambda url, token: saved.append((url, token)) or True)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/setup/status").json()["completed"] is False
        assert client.post("/api/setup/complete").status_code == 409
        assert client.post("/api/setup/institution", json={"slug": "hs-coburg"}).status_code == 200
        connected = client.post("/api/setup/moodle", json={"token": "invented-token"})
        assert connected.status_code == 200, connected.text
        assert connected.json()["moodle_connected"] is True
        with factory() as session:
            health = session.query(ConnectorHealth).filter_by(connector="moodle").one()
            assert health.status == "ok" and health.message is None
            assert health.consecutive_failures == 0 and health.last_success_at is None
        assert "invented-token" not in connected.text
        assert client.post("/api/setup/notifications", json={"enabled": False}).status_code == 200
        assert client.post("/api/setup/complete").status_code == 409
        assert client.get("/api/setup/status").json()["study_program_confirmed"] is False
        save_program_choice(settings.local_dir, "Bachelor Betriebswirtschaft",
                            "https://mycampus.hs-coburg.de/de/courses/bachelor-betriebswirtschaft")
        assert client.get("/api/setup/status").json()["study_program"] == "Bachelor Betriebswirtschaft"
        assert client.post("/api/setup/complete").json()["completed"] is True
        assert any(connector.name == "moodle" for connector in app.state.sync_engine.connectors)
    assert len(saved) == 1
    assert json.loads(marker.read_text(encoding="utf-8"))["completed"] is True


def test_setup_allows_a_neutral_profile_without_moodle(settings, coordinator):
    settings = settings.model_copy(update={"institution_slug": "generic", "moodle_base_url": "",
                                           "moodle_token": ""})
    marker = settings.local_dir / "setup.json"
    marker.write_text('{"version":1,"institution":null,"notifications":null,"completed":false}', encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        status = client.get("/api/setup/status").json()
        assert status["institution_name"] == "Eigene Hochschule"
        assert status["moodle_available"] is False
        registry = client.get("/api/connectors/registry").json()
        assert registry["active_profile"] == "generic"
        assert registry["profiles"][0]["slug"] == "generic"
        assert client.post("/api/setup/institution", json={"slug": "generic"}).status_code == 200
        assert client.post("/api/setup/notifications", json={"enabled": False}).status_code == 200
        assert client.post("/api/setup/complete").status_code == 409
        assert client.post("/api/setup/program", json={"name": "  "}).status_code == 422
        selected = client.post("/api/setup/program", json={"name": " Bachelor Betriebswirtschaft "})
        assert selected.status_code == 200
        assert selected.json()["study_program"] == "Bachelor Betriebswirtschaft"
        assert client.post("/api/setup/complete").json()["completed"] is True


def test_first_setup_switches_institution_without_restart(settings, coordinator):
    settings = settings.model_copy(update={"institution_slug": "generic", "moodle_base_url": "",
                                           "moodle_token": ""})
    (settings.local_dir / "setup.json").write_text(
        '{"version":1,"institution":null,"notifications":null,"completed":false}', encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post("/api/setup/program", json={"name": "Bachelor Informatik"}).status_code == 409
        client.post("/api/setup/institution", json={"slug": "generic"})
        assert client.post("/api/setup/program", json={"name": "Bachelor Betriebswirtschaft"}).status_code == 200
        result = client.post("/api/setup/institution", json={"slug": "hs-coburg"})
        assert result.status_code == 200
        assert result.json()["institution_confirmed"] is True
        assert result.json()["moodle_available"] is True
        assert result.json()["institution"] == "hs-coburg"
        assert "restart_required" not in result.json()
        assert result.json()["study_program_confirmed"] is False


def test_setup_refuses_notification_url_outside_private_ntfy_topic(settings, coordinator):
    marker = settings.local_dir / "setup.json"
    marker.write_text('{"version":1,"institution":"hs-coburg","notifications":null,"completed":false}', encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/setup/notifications", json={"enabled": True, "url": "https://example.invalid/a"})
        assert response.status_code == 400
        assert client.get("/api/setup/status").json()["notifications"] is None


def test_setup_accepts_automatic_local_moodle_return(settings, factory, coordinator, monkeypatch):
    settings.moodle_token = ""
    (settings.local_dir / "setup.json").write_text(
        '{"version":1,"institution":"hs-coburg","notifications":null,"completed":false}',
        encoding="utf-8")
    monkeypatch.setattr("app.setup.api.secrets.token_urlsafe", lambda _size: "invented-passport")
    saved = []
    monkeypatch.setattr("app.setup.api.save_moodle_token", lambda url, token: saved.append((url, token)) or True)

    class FakeMoodle:
        name = "moodle"

        def __init__(self, candidate):
            assert candidate.moodle_token == "inventedtoken"

        def call(self, _function):
            return {"userid": 123}

    monkeypatch.setattr("app.setup.api.MoodleClient", FakeMoodle)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        launch = client.post("/api/setup/moodle/start").json()["login_url"]
        assert "urlscheme=marcunios" in launch
        base = "https://moodle.hs-coburg.de"
        site_id = hashlib.md5((base + "invented-passport").encode()).hexdigest()
        encoded = base64.b64encode(f"{site_id}:::inventedtoken".encode()).decode()
        callback = "marcunios://token=" + encoded
        response = client.post("/api/setup/moodle/callback", json={"callback": callback})
        assert response.status_code == 200
        assert response.json()["moodle_connected"] is True
        assert encoded not in response.text
        repeated = client.post("/api/setup/moodle/callback", json={"callback": callback})
        assert repeated.status_code == 200
        assert repeated.json() == response.json()
        assert len(saved) == 1
        assert client.post("/api/setup/moodle/callback", json={"callback": "marcunios://token=ZmFrZQ=="}).status_code == 400
        client.post("/api/setup/moodle/start")
        # A different return cannot reuse a previous success after starting again.
        assert client.post("/api/setup/moodle/callback", json={"callback": "marcunios://token=ZmFrZQ=="}).status_code == 400


def test_concurrent_moodle_returns_wait_for_one_keychain_write(settings, factory, coordinator, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    settings.moodle_token = ""
    (settings.local_dir / "setup.json").write_text(
        '{"version":1,"institution":"hs-coburg","completed":false}', encoding="utf-8")
    monkeypatch.setattr("app.setup.api.secrets.token_urlsafe", lambda _size: "invented-passport")
    entered, release = Event(), Event()
    saved = []

    def save(_url, token):
        saved.append(token)
        entered.set()
        assert release.wait(5)
        return True

    class FakeMoodle:
        name = "moodle"

        def __init__(self, _candidate):
            pass

        def call(self, _function):
            return {"userid": 123}

    monkeypatch.setattr("app.setup.api.MoodleClient", FakeMoodle)
    monkeypatch.setattr("app.setup.api.save_moodle_token", save)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client, ThreadPoolExecutor(2) as pool:
        client.post("/api/setup/moodle/start")
        site_id = hashlib.md5(b"https://moodle.hs-coburg.deinvented-passport").hexdigest()
        callback = "marcunios://token=" + base64.b64encode(f"{site_id}:::inventedtoken".encode()).decode()
        first = pool.submit(client.post, "/api/setup/moodle/callback", json={"callback": callback})
        assert entered.wait(5)
        second = pool.submit(client.post, "/api/setup/moodle/callback", json={"callback": callback})
        release.set()
        assert first.result(5).status_code == 200
        assert second.result(5).status_code == 200
        assert saved == ["inventedtoken"]


def test_moodle_return_survives_local_service_restart(settings, factory, coordinator, monkeypatch):
    settings.moodle_token = ""
    settings.api_auth_required = True
    (settings.local_dir / "setup.json").write_text(
        '{"version":1,"institution":"hs-coburg","completed":false}', encoding="utf-8")
    monkeypatch.setattr("app.setup.api.secrets.token_urlsafe", lambda _size: "invented-passport")
    monkeypatch.setattr("app.setup.api.save_moodle_token", lambda _url, _token: True)

    class FakeMoodle:
        name = "moodle"

        def __init__(self, _candidate):
            pass

        def call(self, _function):
            return {"userid": 123}

    monkeypatch.setattr("app.setup.api.MoodleClient", FakeMoodle)
    before = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(before, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 12345)) as client:
        lease = coordinator.current()
        assert lease is not None
        assert client.post("/api/setup/moodle/start", headers={"X-UniOS-Lease-Generation": str(lease.generation)}).status_code == 200
    site_id = hashlib.md5(b"https://moodle.hs-coburg.deinvented-passport").hexdigest()
    callback = "marcunios://token=" + base64.b64encode(f"{site_id}:::inventedtoken".encode()).decode()
    after = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(after, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 12345)) as client:
        response = client.post("/api/setup/moodle/callback", json={"callback": callback})
        assert response.status_code == 200
        assert response.json()["moodle_connected"] is True


def test_protocol_handler_sends_callback_only_to_local_setup(monkeypatch, capsys):
    observed: list[tuple[str, dict]] = []
    opened: list[str] = []

    class FakeResponse:
        def raise_for_status(self):
            return None

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, _type, _value, _traceback):
            return None

        def post(self, url, json):
            observed.append((url, json))
            return FakeResponse()

    monkeypatch.setattr(protocol_handler.httpx, "Client", lambda **_kwargs: FakeClient())
    monkeypatch.setattr(protocol_handler.webbrowser, "open", opened.append)
    callback = "marcunios://token=ZmFrZQ=="
    assert protocol_handler.main([callback]) == 0
    assert observed == [("http://127.0.0.1:8000/api/setup/moodle/callback", {"callback": callback})]
    assert opened == ["http://127.0.0.1:8000/"]
    assert callback not in capsys.readouterr().out
    assert protocol_handler.main(["https://example.invalid/token=unsafe"]) == 2
