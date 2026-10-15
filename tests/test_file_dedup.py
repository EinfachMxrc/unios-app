# SPDX-License-Identifier: AGPL-3.0-or-later

import os

from sqlalchemy import create_engine, select

from app.connectors.base import (
    ConnectorAuth,
    ConnectorStatus,
    RemoteCourse,
    RemoteResource,
    RemoteSection,
    Snapshot,
)
from app.db.models import Base, Resource, ResourceVersion
from app.db.session import make_session_factory
from app.files.sidecars import SidecarV1, rebuild_index
from app.notify.service import Notifier
from app.sync.engine import SyncEngine


class SharedFileConnector:
    def __init__(self, name: str):
        self.name = name
        self.downloads = 0

    def check_auth(self):
        return ConnectorAuth("fixture-user")

    def list_courses(self):
        return self.fetch_changes().courses

    def fetch_changes(self, since=None):
        return Snapshot([RemoteCourse(
            key="same-course", name="Mathematik",
            sections=[RemoteSection("same-section", "Material", 1)],
            resources=[RemoteResource("same-resource", "Skript.pdf", "https://example.invalid/skript", "file", "same-section")],
        )])

    def download(self, resource):
        self.downloads += 1
        return b"The same bytes from two independent sources"

    def health(self):
        return ConnectorStatus("ok")


def test_same_hash_from_two_sources_keeps_both_references_without_duplicate(settings, factory, coordinator, tmp_path):
    connectors = [SharedFileConnector("source-a"), SharedFileConnector("source-b")]
    sync = SyncEngine(factory, settings, connectors, Notifier(settings, coordinator), coordinator)

    assert sync.run().status == "success"
    assert sync.run().status == "success"
    assert [connector.downloads for connector in connectors] == [1, 1]

    with factory() as session:
        resources = session.scalars(select(Resource).order_by(Resource.source)).all()
        versions = session.scalars(select(ResourceVersion).order_by(ResourceVersion.id)).all()
        assert [resource.source for resource in resources] == ["source-a", "source-b"]
        assert len(versions) == 2
        assert versions[0].sha256 == versions[1].sha256
        assert versions[0].relative_path != versions[1].relative_path
        paths = [settings.data_dir / version.relative_path for version in versions]

    assert os.path.samefile(*paths)
    for source, path in zip(("source-a", "source-b"), paths):
        sidecar = SidecarV1.model_validate_json(path.with_name(path.name + ".unios.json").read_text())
        assert sidecar.source == source
        assert sidecar.source_key == "same-resource"

    replacement = create_engine(f"sqlite:///{tmp_path / 'rebuilt.sqlite'}")
    try:
        Base.metadata.create_all(replacement)
        restored_factory = make_session_factory(replacement)
        assert rebuild_index(restored_factory, settings.data_dir)["versions_created"] == 2
        with restored_factory() as session:
            assert {resource.source for resource in session.scalars(select(Resource)).all()} == {"source-a", "source-b"}
            assert len(session.scalars(select(ResourceVersion)).all()) == 2
    finally:
        replacement.dispose()
