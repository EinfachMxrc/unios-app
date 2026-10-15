# SPDX-License-Identifier: AGPL-3.0-or-later

"""The example connector plug-in template satisfies the Connector interface.

Imports it straight from ``examples/connector-plugin/src`` (added to
``sys.path`` here) rather than requiring it to be pip-installed, so the
example stays covered without adding an install step to the main test run.
"""

import sys
from pathlib import Path

import pytest

from app.config import Settings
from app.connectors.base import (
    ConnectorAuth,
    ConnectorStatus,
    RemoteCourse,
    RemoteResource,
    Snapshot,
)
from app.connectors.manifest import verified_registry
from app.connectors.permissions import ConnectorPermissions
from app.connectors.plugins import load_connector_plugins
from app.connectors.sdk import connector_context

_EXAMPLE_SRC = Path(__file__).resolve().parents[1] / "examples" / "connector-plugin" / "src"
if str(_EXAMPLE_SRC) not in sys.path:
    sys.path.insert(0, str(_EXAMPLE_SRC))

from unios_connector_example.connector import ExampleUniversityConnector


class _FakeEntry:
    def __init__(self, name: str, factory):
        self.name = name
        self._factory = factory
        self.dist = type("Dist", (), {"metadata": {"Name": "unios-connector-example"}, "version": "0.1.0"})()

    def load(self):
        return self._factory


def test_example_connector_loads_through_the_real_plugin_loader(monkeypatch, tmp_path):
    """Exercises the same validation app/connectors/plugins.py applies to any installed plug-in."""
    monkeypatch.setattr("app.connectors.plugins.entry_points", lambda **kwargs: [
        _FakeEntry("example_university", ExampleUniversityConnector),
    ])
    ConnectorPermissions(tmp_path).append(verified_registry()["example_university"], "approve")
    found = load_connector_plugins(Settings(_env_file=None, institution_slug="generic", local_dir=tmp_path,
                                            allow_trusted_python_connectors=True,
                                            connector_plugins="example_university"))
    assert len(found) == 1
    connector = found[0]
    assert connector.name == "example_university"
    assert isinstance(connector.delegate, ExampleUniversityConnector)
    assert connector.fetch_changes().courses


def test_example_connector_returns_well_formed_read_only_data(settings):
    manifest = verified_registry()["example_university"]
    connector = ExampleUniversityConnector(connector_context(manifest, "generic", {}, {}))

    auth = connector.check_auth()
    assert isinstance(auth, ConnectorAuth)
    assert auth.account_id

    courses = connector.list_courses()
    assert courses, "Vorlagen-Connector sollte mindestens einen Beispielkurs liefern"
    for course in courses:
        assert isinstance(course, RemoteCourse)
        assert course.key and course.name
        for resource in course.resources:
            assert isinstance(resource, RemoteResource)
            assert resource.key.startswith(course.key)
            assert resource.url.startswith("https://")

    snapshot = connector.fetch_changes(since=None)
    assert isinstance(snapshot, Snapshot)
    assert [course.key for course in snapshot.courses] == [course.key for course in courses]
    assert snapshot.assignments_complete is True
    assert snapshot.warnings == []

    for course in courses:
        for resource in course.resources:
            data = connector.download(resource)
            assert isinstance(data, bytes)
            assert len(data) == resource.size

    with pytest.raises(ValueError):
        connector.download(RemoteResource(key="unbekannt", name="?", url="https://example.invalid/x", kind="file"))

    status = connector.health()
    assert isinstance(status, ConnectorStatus)
    assert status.status == "ok"
    assert status.message
