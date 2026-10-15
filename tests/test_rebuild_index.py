# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from typer.testing import CliRunner

from app.cli.main import cli
from app.db.models import Base, Course, CourseSection, Resource, ResourceVersion
from app.db.session import make_session_factory
from app.files.sidecars import rebuild_index
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from tests.test_moodle_sync import FixtureMoodle


def test_rebuild_restores_all_downloaded_versions_without_changing_files(settings, factory, coordinator, tmp_path):
    moodle = FixtureMoodle(settings)
    sync = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    sync.run()
    moodle.contents[101][0]["modules"][0]["contents"][0]["timemodified"] += 1
    moodle.files["/webservice/pluginfile.php/10/04_Schleifen.pdf"] = b"%PDF-fixture-2"
    sync.run()

    sidecars = list((settings.data_dir / "uni").rglob("*.unios.json"))
    documents = [path.with_name(path.name.removesuffix(".unios.json")) for path in sidecars]
    original = {str(path): path.read_bytes() for path in documents}
    assert len(sidecars) == 3

    replacement = create_engine(f"sqlite:///{tmp_path / 'restored.sqlite3'}")
    Base.metadata.create_all(replacement)
    restored_factory = make_session_factory(replacement)
    result = rebuild_index(restored_factory, settings.data_dir)
    assert result == {"sidecars": 3, "resources_created": 3, "versions_created": 3}
    with restored_factory() as session:
        assert session.scalar(select(func.count()).select_from(Course)) == 2
        assert session.scalar(select(func.count()).select_from(Resource)) == 3
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 3
    assert rebuild_index(restored_factory, settings.data_dir)["versions_created"] == 0
    assert {str(path): path.read_bytes() for path in documents} == original
    replacement.dispose()


def test_cli_rebuild_after_database_deletion_restores_files_and_links(monkeypatch, settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    sync = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert sync.run().status == "success"
    moodle.responses["mod_url_get_urls_by_courses"]["urls"][0]["externalurl"] = (
        "https://docs.python.org/3/tutorial/?chapter=1&token=fixture-secret&sesskey=fixture-session"
    )
    assert sync.run().status == "success"
    assert sync.run().status == "success"
    link_sidecars = list((settings.data_dir / "uni" / "_links").rglob("*.unios-link.json"))
    assert len(link_sidecars) == 2
    assert all(b"fixture-secret" not in path.read_bytes() and b"fixture-session" not in path.read_bytes()
               for path in link_sidecars)
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Resource)) == 3
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 2
        link = session.scalar(select(Resource).where(Resource.kind == "link"))
        assert link.url == "https://docs.python.org/3/tutorial/?chapter=1"
    documents = {path: path.read_bytes() for path in (settings.data_dir / "uni").rglob("*.*") if path.is_file()}

    coordinator.close()
    factory.kw["bind"].dispose()
    database = Path(make_url(settings.database_url).database)
    database.unlink()
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)

    result = CliRunner().invoke(cli, ["rebuild-index"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"sidecars": 2, "resources_created": 3, "versions_created": 2,
                                         "annotation_logs": 0, "annotations_created": 0}
    with create_engine(settings.database_url).connect() as connection:
        assert connection.scalar(select(func.count()).select_from(Resource)) == 3
        assert connection.scalar(select(func.count()).select_from(ResourceVersion)) == 2
        assert connection.scalar(select(Resource.url).where(Resource.kind == "link")) == (
            "https://docs.python.org/3/tutorial/?chapter=1"
        )
    assert {path: path.read_bytes() for path in documents} == documents


def test_rebuild_restores_file_metadata_changes_without_extra_version(settings, factory, coordinator, tmp_path):
    moodle = FixtureMoodle(settings)
    sync = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert sync.run().status == "success"
    file_content = moodle.contents[101][0]["modules"][0]["contents"][0]
    file_content["filename"] = "Schleifen aktualisiert.pdf"
    # User-facing title comes from Moodle's activity, not its file basename.
    moodle.contents[101][0]["modules"][0]["name"] = "Schleifen aktualisiert.pdf"
    file_content["timemodified"] += 60
    moodle.responses["core_enrol_get_users_courses"][0]["fullname"] = "Programmieren aktualisiert"
    moodle.contents[101][0]["name"] = "Neue Schleifen"
    assert sync.run().status == "success"
    assert sync.run().status == "success"
    assert moodle.download_count == 3
    moodle.contents[101][0]["modules"][0]["contents"] = []
    assert sync.run().status == "success"
    with factory() as session:
        resource = session.scalar(select(Resource).where(Resource.kind == "file", Resource.source_key.like("101:%")))
        assert resource.name == "Schleifen aktualisiert.pdf"
        assert resource.upstream_modified == file_content["timemodified"]
        assert resource.removed_upstream is True
        assert session.get(Course, resource.course_id).name == "Programmieren aktualisiert"
        assert session.get(CourseSection, resource.section_id).name == "Neue Schleifen"
        assert session.scalar(select(func.count()).select_from(ResourceVersion).where(
            ResourceVersion.resource_id == resource.id)) == 1
    state_sidecars = list((settings.data_dir / "uni" / "_file_states").rglob("*.unios-file.json"))
    assert len([path for path in state_sidecars if b"101:501:" in path.read_bytes()]) == 3

    replacement = create_engine(f"sqlite:///{tmp_path / 'restored.sqlite3'}")
    Base.metadata.create_all(replacement)
    restored_factory = make_session_factory(replacement)
    assert rebuild_index(restored_factory, settings.data_dir)["versions_created"] == 2
    with restored_factory() as session:
        resource = session.scalar(select(Resource).where(Resource.kind == "file", Resource.source_key.like("101:%")))
        assert resource.name == "Schleifen aktualisiert.pdf"
        assert resource.upstream_modified == file_content["timemodified"]
        assert resource.removed_upstream is True
        assert session.get(Course, resource.course_id).name == "Programmieren aktualisiert"
        assert session.get(CourseSection, resource.section_id).name == "Neue Schleifen"
        assert session.scalar(select(func.count()).select_from(ResourceVersion).where(
            ResourceVersion.resource_id == resource.id)) == 1
    replacement.dispose()


def test_rebuild_rejects_modified_link_sidecar(settings, factory, coordinator, tmp_path):
    moodle = FixtureMoodle(settings)
    sync = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert sync.run().status == "success"
    sidecar = next((settings.data_dir / "uni" / "_links").rglob("*.unios-link.json"))
    sidecar.write_bytes(sidecar.read_bytes().replace(b"docs.python.org", b"evil.example.invalid"))
    replacement = create_engine(f"sqlite:///{tmp_path / 'restored.sqlite3'}")
    Base.metadata.create_all(replacement)
    with pytest.raises(ValueError, match="Metadaten-Sidecar-Pfad"):
        rebuild_index(make_session_factory(replacement), settings.data_dir)
    replacement.dispose()


def test_rebuild_rejects_modified_file_state_sidecar(settings, factory, coordinator, tmp_path):
    moodle = FixtureMoodle(settings)
    sync = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert sync.run().status == "success"
    sidecar = next((settings.data_dir / "uni" / "_file_states").rglob("*.unios-file.json"))
    sidecar.write_bytes(sidecar.read_bytes().replace(b"moodle.example.invalid", b"evil.example.invalid"))
    replacement = create_engine(f"sqlite:///{tmp_path / 'restored.sqlite3'}")
    Base.metadata.create_all(replacement)
    with pytest.raises(ValueError, match="Metadaten-Sidecar-Pfad"):
        rebuild_index(make_session_factory(replacement), settings.data_dir)
    replacement.dispose()
