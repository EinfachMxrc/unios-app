# SPDX-License-Identifier: AGPL-3.0-or-later

from dataclasses import dataclass
from typing import ClassVar

import pytest

from app.config import Settings
from app.connectors.manifest import registered_profiles, verified_registry
from app.connectors.permissions import ConnectorPermissions
from app.connectors.plugins import ConnectorPluginError, load_connector_plugins
from app.connectors.sdk import (
    PermissionedConnector,
    RemoteCourse,
    RemoteResource,
    connector_context,
)


@dataclass
class Entry:
    name: str
    factory: object
    dist: object = None
    loaded: bool = False

    def load(self):
        self.loaded = True
        return self.factory


class Demo:
    name = "example_university"

    def check_auth(self): ...
    def list_courses(self): ...
    def fetch_changes(self, since=None): ...
    def download(self, resource): ...
    def health(self): ...


class Dist:
    metadata: ClassVar[dict[str, str]] = {"Name": "unios-connector-example"}
    version = "0.1.0"


def test_plugins_are_explicitly_enabled_and_checked(monkeypatch, tmp_path):
    monkeypatch.setattr("app.connectors.plugins.entry_points", lambda **kwargs: [
        Entry("example_university", lambda context: Demo(), Dist()),
    ])
    settings = Settings(_env_file=None, institution_slug="generic", local_dir=tmp_path,
                        allow_trusted_python_connectors=True,
                        connector_plugins="example_university")
    assert load_connector_plugins(settings.model_copy(update={"connector_plugins": ""})) == []
    with pytest.raises(ConnectorPluginError, match="Berechtigungsfreigabe"):
        load_connector_plugins(settings)
    ConnectorPermissions(tmp_path).append(verified_registry()["example_university"], "approve")
    found = load_connector_plugins(settings)
    assert len(found) == 1 and found[0].name == "example_university"
    with pytest.raises(ConnectorPluginError, match="Registry"):
        load_connector_plugins(settings.model_copy(update={"connector_plugins": "unknown"}))
    with pytest.raises(ConnectorPluginError, match="eindeutig"):
        load_connector_plugins(settings.model_copy(update={"connector_plugins": "example_university,example_university"}))
    ConnectorPermissions(tmp_path).append(verified_registry()["example_university"], "revoke")
    with pytest.raises(ConnectorPluginError, match="Berechtigungsfreigabe"):
        load_connector_plugins(settings)


def test_plugin_interface_is_validated(monkeypatch, tmp_path):
    monkeypatch.setattr("app.connectors.plugins.entry_points", lambda **kwargs: [
        Entry("example_university", lambda context: object(), Dist()),
    ])
    ConnectorPermissions(tmp_path).append(verified_registry()["example_university"], "approve")
    with pytest.raises(ConnectorPluginError, match="API v1"):
        load_connector_plugins(Settings(_env_file=None, institution_slug="generic", local_dir=tmp_path,
                                        allow_trusted_python_connectors=True,
                                        connector_plugins="example_university"))


def test_manifest_change_requires_a_new_approval(tmp_path):
    manifest = verified_registry()["example_university"]
    grants = ConnectorPermissions(tmp_path)
    grants.append(manifest, "approve")
    assert grants.is_approved(manifest)
    changed = manifest.model_copy(update={"domains": manifest.domains | {"new.example.org"}})
    assert not grants.is_approved(changed)
    grants.append(manifest, "revoke")
    assert not grants.is_approved(manifest)


def test_plugin_code_is_not_loaded_before_approval(monkeypatch, tmp_path):
    entry = Entry("example_university", lambda context: Demo(), Dist())
    monkeypatch.setattr("app.connectors.plugins.entry_points", lambda **kwargs: [entry])
    settings = Settings(_env_file=None, institution_slug="generic", local_dir=tmp_path,
                        allow_trusted_python_connectors=True,
                        connector_plugins="example_university")
    with pytest.raises(ConnectorPluginError, match="Berechtigungsfreigabe"):
        load_connector_plugins(settings)
    assert not entry.loaded
    ConnectorPermissions(tmp_path).append(verified_registry()["example_university"], "approve")
    entry.dist.version = "9.9.9"
    with pytest.raises(ConnectorPluginError, match="Paketversion"):
        load_connector_plugins(settings)
    assert not entry.loaded


def test_trusted_python_runtime_requires_a_separate_opt_in(monkeypatch, tmp_path):
    entry = Entry("example_university", lambda context: Demo(), Dist())
    monkeypatch.setattr("app.connectors.plugins.entry_points", lambda **kwargs: [entry])
    ConnectorPermissions(tmp_path).append(verified_registry()["example_university"], "approve")
    settings = Settings(_env_file=None, institution_slug="generic", local_dir=tmp_path,
                        connector_plugins="example_university")
    with pytest.raises(ConnectorPluginError, match="Host-Prozess"):
        load_connector_plugins(settings)
    assert not entry.loaded


def test_public_profiles_are_registered():
    assert {item["slug"] for item in registered_profiles()} == {"generic", "hs-coburg"}


def test_connector_domain_and_capability_checks():
    manifest = verified_registry()["example_university"]
    context = connector_context(manifest, "generic", {}, {})
    with pytest.raises(ValueError, match="Domains"):
        context.get("https://evil.example.org/")
    with pytest.raises(ValueError, match="Domains"):
        context.get("http://example.invalid/")
    with pytest.raises(ValueError, match="Domains"):
        context.get("https://example.invalid:8443/")
    with pytest.raises(ValueError, match="Domains"):
        context.get("https://user@example.invalid/")
    class ResourceDemo(Demo):
        def list_courses(self):
            return [RemoteCourse("1", "Kurs", resources=[
                RemoteResource("1", "Datei", "https://evil.example.org/file", "pdf"),
            ])]
    with pytest.raises(ValueError, match="Domains"):
        PermissionedConnector(ResourceDemo(), manifest).list_courses()
    reduced = manifest.model_copy(update={"capabilities": {"courses.read"}})
    with pytest.raises(ValueError, match="Materialien"):
        PermissionedConnector(ResourceDemo(), reduced).list_courses()


def test_denied_read_does_not_call_plugin():
    called = []

    class CountingDemo(Demo):
        def list_courses(self):
            called.append("courses")
            return []

        def fetch_changes(self, since=None):
            called.append("changes")

    manifest = verified_registry()["example_university"].model_copy(update={"capabilities": set()})
    connector = PermissionedConnector(CountingDemo(), manifest)
    with pytest.raises(ValueError, match="Kurse"):
        connector.list_courses()
    with pytest.raises(ValueError, match="Leseberechtigung"):
        connector.fetch_changes()
    assert called == []
