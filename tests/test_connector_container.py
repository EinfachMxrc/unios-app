# SPDX-License-Identifier: AGPL-3.0-or-later

"""The security boundary and installation workflow use only fake images."""

import io
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.connectors.container_worker import serve
from app.connectors.manifest import ConnectorManifest
from app.connectors.registry_validation import validate_registry, validate_upgrade
from app.connectors.sandbox import ContainerConnector, container_command
from app.connectors.sdk import connector_context
from app.connectors.selection import ConnectorSelection
from app.main import create_app
from app.secrets import load_connector_secret, save_connector_secret


def _manifest() -> ConnectorManifest:
    return ConnectorManifest(
        id="example_university", package="unios-connector-example", package_version="0.2.0",
        api_version=1, capabilities={"courses.read"}, domains={"example.invalid"},
        secrets={"demo_token"}, review_status="verified", runtime="container",
        image="registry.example.org/unios/example@sha256:" + "a" * 64,
    )


def test_container_command_has_no_host_mount_or_network(monkeypatch):
    monkeypatch.setattr("app.connectors.sandbox.shutil.which", lambda _: "docker")
    command = container_command(_manifest())
    assert command[command.index("--network") + 1] == "none"
    assert "--read-only" in command and "--cap-drop" in command
    assert "--volume" not in command and "-v" not in command and "--env" not in command
    assert command[-1] == _manifest().image


def test_registry_install_approve_enable_and_revoke_with_fake_image(settings, coordinator, monkeypatch):
    settings.institution_slug = "generic"
    manifest = _manifest()
    installed = set()
    monkeypatch.setattr("app.connectors.api.verified_registry", lambda: {manifest.id: manifest})
    monkeypatch.setattr("app.connectors.plugins.verified_registry", lambda: {manifest.id: manifest})
    monkeypatch.setattr("app.connectors.api.container_installed", lambda item: item.id in installed)
    monkeypatch.setattr("app.connectors.plugins.container_installed", lambda item: item.id in installed)
    monkeypatch.setattr("app.connectors.api.install_container", lambda item: installed.add(item.id))
    stored = []
    monkeypatch.setattr("app.connectors.api.save_connector_secret",
                        lambda connector_id, alias, value: stored.append((connector_id, alias, value)) or True)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    path = "/api/connectors/example_university"
    body = {"fingerprint": manifest.fingerprint}
    with TestClient(app) as client:
        assert client.post(path + "/approve", json=body).status_code == 409
        assert client.post(path + "/install", json={"fingerprint": "old"}).status_code == 409
        assert client.post(path + "/install", json=body).status_code == 200
        assert client.post(path + "/approve", json=body).status_code == 200
        secret = client.post(path + "/secrets/demo_token", json={**body, "value": "invented-secret"})
        assert secret.status_code == 200 and "invented-secret" not in secret.text
        assert stored == [("example_university", "demo_token", "invented-secret")]
        assert client.post(path + "/secrets/other", json={**body, "value": "fake"}).status_code == 404
        assert client.post(path + "/enable", json={**body, "enabled": True}).status_code == 200
        assert "example_university" in client.get("/api/connectors/registry").json()["enabled_connectors"]
        assert client.post(path + "/revoke", json=body).status_code == 200
        state = client.get("/api/connectors/registry").json()
        assert "example_university" not in state["enabled_connectors"]
        assert not state["connectors"][0]["approved"]


def test_gui_enabled_connector_is_considered_on_next_app_start(settings, coordinator, monkeypatch):
    ConnectorSelection(settings.local_dir).set_enabled("example_university", True)
    called = []
    def fake_loader(plugin_settings, *, include_saved_selection=True):
        called.append((plugin_settings.connector_plugins, include_saved_selection))
        return []
    monkeypatch.setattr("app.main.load_connector_plugins", fake_loader)
    create_app(settings.model_copy(update={"connector_plugins": ""}), connectors=None,
               start_scheduler=False, coordinator=coordinator)
    assert called == [("example_university", False)]


def test_gui_deactivation_overrides_old_environment_selection(tmp_path):
    selection = ConnectorSelection(tmp_path)
    selection.set_enabled("example_university", False)
    assert selection.effective({"example_university"}) == set()
    selection.set_enabled("example_university", True)
    assert selection.effective(set()) == {"example_university"}


def test_connector_secret_needs_secure_keyring(monkeypatch):
    calls = []
    monkeypatch.setattr("app.secrets._secure_backend", lambda: False)
    monkeypatch.setattr("app.secrets.keyring.set_password", lambda *_args: calls.append("write"))
    assert not save_connector_secret("example_university", "demo_token", "invented-secret")
    assert load_connector_secret("example_university", "demo_token") == ""
    assert calls == []


def test_setup_profile_choice_applies_immediately_before_completion(settings, coordinator):
    # During first-run setup (not yet `completed`), choosing an institution
    # applies in place instead of requiring a restart — see
    # app/setup/api.py's `choose_institution`, which only defers to a restart
    # once setup has already been completed (see the test below).
    settings.institution_slug = "generic"
    marker = settings.local_dir / "setup.json"
    marker.write_text('{"version":1,"institution":null,"notifications":null,"completed":false}', encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/setup/institution", json={"slug": "hs-coburg"})
        assert response.status_code == 200
        body = response.json()
        assert "restart_required" not in body
        assert body["pending_institution"] == "hs-coburg"
        assert body["institution_confirmed"] is True
        assert body["moodle_available"] is True
        # Moodle isn't connected and notifications aren't decided yet, so
        # completion is still blocked despite the institution being applied.
        assert client.post("/api/setup/complete").status_code == 409


def test_setup_profile_choice_waits_for_restart_once_completed(settings, coordinator):
    # Once setup has already run to completion, changing the institution
    # can't safely hot-swap live connectors, so it must ask for a restart
    # instead of applying in place (contrast with the test above).
    settings.institution_slug = "generic"
    marker = settings.local_dir / "setup.json"
    marker.write_text('{"version":1,"institution":"generic","notifications":"off","completed":true}', encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/setup/institution", json={"slug": "hs-coburg"})
        assert response.status_code == 200
        assert response.json()["restart_required"] is True
        assert response.json()["pending_institution"] == "hs-coburg"
        assert response.json()["institution_confirmed"] is False
        assert client.post("/api/setup/complete").status_code == 409


def test_worker_returns_contract_on_stdio():
    from app.connectors.base import ConnectorAuth, ConnectorStatus, Snapshot

    class Fake:
        name = "example_university"

        def check_auth(self):
            return ConnectorAuth("fake-account", frozenset({"courses.read"}))

        def list_courses(self):
            return []

        def fetch_changes(self, since=None):
            return Snapshot([])

        def download(self, resource):
            return b"sample"

        def health(self):
            return ConnectorStatus("ok")

    request = {"protocol": 1, "method": "check_auth", "context": {
        "id": "example_university", "profile_slug": "generic", "config": {},
        "capabilities": ["courses.read"], "domains": [], "secrets": {},
    }}
    output = io.StringIO()
    serve(lambda _context: Fake(), input=io.StringIO(json.dumps(request) + "\n"), output=output)
    assert json.loads(output.getvalue())["value"]["account_id"] == "fake-account"


def test_host_worker_roundtrip_with_example_process(monkeypatch):
    source = Path(__file__).resolve().parents[1] / "examples" / "connector-plugin" / "src"
    code = (f"import sys; sys.path.insert(0, {str(source)!r}); "
            "from unios_connector_example.worker import main; main()")
    monkeypatch.setattr("app.connectors.sandbox.container_installed", lambda _: True)
    monkeypatch.setattr("app.connectors.sandbox.container_command", lambda _: [sys.executable, "-c", code])
    manifest = _manifest()
    connector = ContainerConnector(manifest, connector_context(manifest, "generic", {}, {}))
    assert connector.check_auth().account_id == "example-student"
    courses = connector.list_courses()
    assert courses[0].name == "Einführung in die Informatik"
    assert connector.download(courses[0].resources[0]).startswith(b"%PDF")


def test_registry_upgrade_requires_new_package_version(tmp_path):
    assert validate_registry() == []
    previous = tmp_path / "registry.json"
    from app.connectors.manifest import verified_registry
    old = verified_registry()["example_university"].model_dump(mode="json")
    old["domains"] = ["old.example.org"]
    previous.write_text(json.dumps({"connectors": [old]}), encoding="utf-8")
    assert any("Paketversion" in item for item in validate_upgrade(previous))
