# SPDX-License-Identifier: AGPL-3.0-or-later

"""Immutable resources remain readable with Windows paths beyond MAX_PATH."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.db.models import Resource, ResourceVersion
from app.files.localpath import native_path
from app.files.sidecars import (
    ResourceStateSidecarV1,
    SidecarV1,
    rebuild_index,
    write_file_state_sidecar,
    write_link_sidecar,
    write_sidecar,
)
from app.files.store import FileStore

NOW = datetime(2026, 10, 7, tzinfo=UTC)


def archive_root(tmp_path: Path, long: bool = True) -> Path:
    root = tmp_path / "synthetic-archive"
    if long:
        while len(str(root)) < 300:
            root /= "synthetic-nested-folder-with-portable-component-length"
    return root


def state(key: str, name: str = "Synthetic resource") -> ResourceStateSidecarV1:
    return ResourceStateSidecarV1(
        source="fixture", source_key=key, course_source_id="synthetic-course",
        course_name="Synthetic course", semester_name="Synthetic semester",
        resource_name=name, resource_url="https://example.invalid/synthetic", observed_at=NOW,
    )


@pytest.mark.parametrize("long", [False, True], ids=["short", "long"])
@pytest.mark.parametrize("kind", ["link", "file"])
def test_state_sidecars_reuse_unchanged_metadata_and_append_changes(tmp_path, long, kind):
    root = archive_root(tmp_path, long)
    write = write_link_sidecar if kind == "link" else write_file_state_sidecar
    initial = state(kind)
    first = write(root, initial)
    if long:
        assert len(str(first)) > 260
    assert write(root, initial.model_copy(update={"observed_at": NOW + timedelta(seconds=1)})) == first
    changed = initial.model_copy(update={"resource_name": "Synthetic renamed", "observed_at": NOW + timedelta(seconds=2)})
    second = write(root, changed)
    assert second != first
    assert write(root, changed) == second
    assert ResourceStateSidecarV1.model_validate_json(native_path(first).read_bytes()) == initial
    assert ResourceStateSidecarV1.model_validate_json(native_path(second).read_bytes()) == changed


def test_file_store_reuses_and_links_content_in_a_long_archive(tmp_path):
    root = archive_root(tmp_path)
    store = FileStore(root)
    content = b"Synthetic document bytes"
    digest = FileStore.digest(content)
    arguments = (content, "Semester", "Course", "Section", "Synthetic.txt", 1, digest, NOW, "fixture")
    first = store.save(*arguments, "first")
    assert len(str(root / first)) > 260
    assert store.save(*arguments, "first") == first
    second = store.save(*arguments, "second", existing_path=root / first)
    assert second != first
    assert native_path(root / first).samefile(native_path(root / second))
    assert native_path(root / first).read_bytes() == content


def test_rebuild_reads_long_document_and_state_sidecars_without_changing_files(tmp_path, factory):
    root = archive_root(tmp_path)
    content = b"Synthetic complete document"
    digest = FileStore.digest(content)
    relative = FileStore(root).save(content, "Semester", "Course", "Section", "Synthetic.txt", 1, digest,
                                    NOW, "fixture", "file")
    metadata = SidecarV1(
        source="fixture", source_key="file", course_source_id="synthetic-course",
        course_name="Synthetic course", semester_name="Synthetic semester",
        resource_name="Synthetic original", resource_url="https://example.invalid/synthetic",
        relative_path=relative.as_posix(), sha256=digest, size=len(content), mime_type="text/plain",
        version=1, downloaded_at=NOW,
    )
    document_sidecar = write_sidecar(root, metadata)
    assert write_sidecar(root, metadata.model_copy(update={"downloaded_at": NOW + timedelta(seconds=1)})) == document_sidecar
    original_sidecar_bytes = native_path(document_sidecar).read_bytes()
    write_file_state_sidecar(root, state("file", "Synthetic renamed"))
    write_link_sidecar(root, state("link"))

    assert rebuild_index(factory, root) == {"sidecars": 1, "resources_created": 2, "versions_created": 1}
    assert rebuild_index(factory, root) == {"sidecars": 1, "resources_created": 0, "versions_created": 0}
    with factory() as session:
        resources = session.scalars(select(Resource).order_by(Resource.source_key)).all()
        assert [(resource.source_key, resource.kind, resource.name) for resource in resources] == [
            ("file", "file", "Synthetic renamed"), ("link", "link", "Synthetic resource"),
        ]
        assert session.scalar(select(ResourceVersion.relative_path)) == relative.as_posix()
    assert native_path(root / relative).read_bytes() == content
    assert native_path(document_sidecar).read_bytes() == original_sidecar_bytes


def test_rebuild_still_rejects_tampered_state_on_a_long_path(tmp_path, factory):
    root = archive_root(tmp_path)
    sidecar = write_link_sidecar(root, state("link"))
    physical = native_path(sidecar)
    physical.write_bytes(physical.read_bytes().replace(b"example.invalid", b"tampered.invalid"))
    with pytest.raises(ValueError, match="Metadaten-Sidecar-Pfad"):
        rebuild_index(factory, root)
