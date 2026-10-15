# SPDX-License-Identifier: AGPL-3.0-or-later

"""One file that cannot be stored must not stop Moodle from importing everything else."""

import sys
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.db.models import Change, Course, ResourceVersion
from app.files import localpath
from app.files.sidecars import SidecarV1, _under_uni, write_sidecar
from app.files.store import FileStore
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from tests.test_moodle_sync import FixtureMoodle

BS = chr(92)
PREFIX = BS * 2 + "?" + BS  # Windows' extended-length path marker


def test_extended_length_prefix_is_removed_from_resolved_paths():
    assert localpath.strip_extended_prefix(PREFIX + "C:" + BS + "Users" + BS + "x") == "C:" + BS + "Users" + BS + "x"
    assert localpath.strip_extended_prefix(PREFIX + "UNC" + BS + "server" + BS + "share") == BS * 2 + "server" + BS + "share"
    assert localpath.strip_extended_prefix(r"C:\Users\x\a.pdf") == r"C:\Users\x\a.pdf"
    assert localpath.strip_extended_prefix("/home/x/a.pdf") == "/home/x/a.pdf"


@pytest.mark.skipif(sys.platform != "win32", reason="the extended-length prefix only exists on Windows")
def test_long_resolved_paths_stay_inside_the_uni_folder(tmp_path, monkeypatch):
    """Long resolved paths carry the extended-length prefix; that must not look like an escape."""
    document = tmp_path / "uni" / "Semester_1" / "Kurs" / "Abschnitt" / "datei.pdf"
    document.parent.mkdir(parents=True)
    document.write_bytes(b"%PDF")
    real_resolve = Path.resolve

    def resolve_with_prefix(self, *args, **kwargs):
        result = real_resolve(self, *args, **kwargs)
        return Path(PREFIX + str(result)) if len(str(result)) > len(str(tmp_path / "uni")) + 10 else result

    monkeypatch.setattr(Path, "resolve", resolve_with_prefix)
    inside = _under_uni(tmp_path, "uni/Semester_1/Kurs/Abschnitt/datei.pdf")
    assert str(inside).startswith(str(tmp_path))
    with pytest.raises(ValueError, match="außerhalb"):
        _under_uni(tmp_path, "../datei.pdf")


def _sidecar(relative_path: str, downloaded_at) -> SidecarV1:
    return SidecarV1(
        source="moodle", source_key="key-1", course_source_id="1", course_source="moodle", course_name="Kurs",
        semester_name="Semester_1", resource_name="datei.pdf", resource_url="https://moodle.example/f",
        relative_path=relative_path, sha256="a" * 64, size=4, mime_type="application/pdf", version=1,
        downloaded_at=downloaded_at,
    )


def test_a_sidecar_left_by_an_aborted_sync_is_accepted_again(tmp_path):
    """A rolled-back run leaves its files behind; the retry downloads the same file with a new timestamp."""
    from app.db.models import utc_now

    document = tmp_path / "uni" / "S" / "K" / "A" / "datei.pdf"
    document.parent.mkdir(parents=True)
    document.write_bytes(b"%PDF")
    first_time = utc_now()
    first = write_sidecar(tmp_path, _sidecar("uni/S/K/A/datei.pdf", first_time))
    again = write_sidecar(tmp_path, _sidecar("uni/S/K/A/datei.pdf", first_time + timedelta(minutes=5)))
    assert again == first
    assert len(list(document.parent.glob("*.unios.json"))) == 1


def test_a_sidecar_for_different_content_is_still_refused(tmp_path):
    from app.db.models import utc_now

    document = tmp_path / "uni" / "S" / "K" / "A" / "datei.pdf"
    document.parent.mkdir(parents=True)
    document.write_bytes(b"%PDF")
    write_sidecar(tmp_path, _sidecar("uni/S/K/A/datei.pdf", utc_now()))
    other = _sidecar("uni/S/K/A/datei.pdf", utc_now()).model_copy(update={"sha256": "b" * 64})
    with pytest.raises(FileExistsError):
        write_sidecar(tmp_path, other)


def test_unstorable_file_is_skipped_reported_and_retried(monkeypatch, settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    real_save = FileStore.save

    def refuse_the_presentation(self, data, semester, course, section, filename, *args, **kwargs):
        if filename == "Blatt_01.pptx":
            raise ValueError("Dateiversion liegt außerhalb des Uni-Ordners")
        return real_save(self, data, semester, course, section, filename, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(FileStore, "save", refuse_the_presentation)
        run = engine.run()
    assert run.status == "warning"
    assert "1" in (run.error or "")
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Course)) == 2
        names = {version.relative_path.rsplit("/", 1)[-1] for version in session.scalars(select(ResourceVersion))}
        # Long macOS/Windows temp roots may shorten the display stem; the
        # immutable content hash is the file's identity on every platform.
        expected_hash = FileStore.digest(b"%PDF-fixture-1")[:16]
        assert len(names) == 1 and any(expected_hash in name and name.endswith(".pdf") for name in names)
        skipped = session.scalars(select(Change).where(Change.kind == "sync_warning")).all()
        assert len(skipped) == 1 and "Blatt_01.pptx" in skipped[0].summary

    retried = engine.run()
    assert retried.status == "success"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 2
