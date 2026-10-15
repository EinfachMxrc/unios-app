# SPDX-License-Identifier: AGPL-3.0-or-later

import base64
import hashlib
from datetime import UTC, datetime

import pytest

from app.files.sidecars import ResourceStateSidecarV1, write_file_state_sidecar
from app.files.store import FileStore, safe_name
from scripts.setup_token import token_from_callback


@pytest.mark.parametrize("name", ["CON.txt", "weird<>:?*|.pdf", "a. ", "folder/../test", "  "])
def test_windows_safe_names(name):
    result = safe_name(name)
    assert result
    assert not any(char in result for char in '<>:"/\\|?*')
    assert not result.endswith((".", " "))
    assert result.split(".")[0].upper() not in {"CON", "PRN", "AUX", "NUL"}


def test_store_never_overwrites_different_bytes(tmp_path):
    store = FileStore(tmp_path)
    now = datetime(2026, 10, 12, tzinfo=UTC)
    data = b"first"
    path = store.save(data, "Semester_1", "Programmieren", "Abschnitt", "folie.pdf", 1, store.digest(data), now, "moodle", "resource-1")
    assert (tmp_path / path).read_bytes() == data
    with pytest.raises(ValueError):
        store.save(b"different", "Semester_1", "Programmieren", "Abschnitt", "folie.pdf", 1, store.digest(data), now, "moodle", "resource-1")
    assert (tmp_path / path).read_bytes() == data


def test_store_refuses_duplicate_when_hardlink_is_unavailable(tmp_path, monkeypatch):
    store = FileStore(tmp_path)
    now = datetime(2026, 10, 12, tzinfo=UTC)
    data = b"shared"
    existing = tmp_path / store.save(data, "Semester_1", "Programmieren", "Abschnitt", "folie.pdf", 1,
                                     store.digest(data), now, "source-a", "resource-1")

    def cannot_link(_source, _target):
        raise OSError("hardlinks unavailable")

    monkeypatch.setattr("app.files.store.os.link", cannot_link)
    with pytest.raises(OSError, match="ohne Duplikat"):
        store.save(data, "Semester_1", "Programmieren", "Abschnitt", "folie.pdf", 1,
                   store.digest(data), now, "source-b", "resource-1", existing)
    assert list((tmp_path / "uni").rglob("*.pdf")) == [existing]


@pytest.mark.parametrize("level", ["uni", "semester", "course", "section"])
def test_store_rejects_symlinked_parent_before_writing(tmp_path, level):
    data_dir = tmp_path / "data"
    outside = tmp_path / "outside"
    outside.mkdir()
    paths = {
        "uni": data_dir / "uni",
        "semester": data_dir / "uni" / "Semester_1",
        "course": data_dir / "uni" / "Semester_1" / "Programmieren",
        "section": data_dir / "uni" / "Semester_1" / "Programmieren" / "Abschnitt",
    }
    link = paths[level]
    link.parent.mkdir(parents=True, exist_ok=True)
    try:
        link.symlink_to(outside, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("Symbolische Links sind auf diesem System nicht verfügbar")

    # macOS temporary paths are long; shortening is covered in separate tests.
    # Keep the fixture's symlink names identical to the folders under test.
    store = FileStore(data_dir, max_path=1000)
    data = b"must stay under data_dir"
    with pytest.raises(ValueError, match="symbolischer Link"):
        store.save(data, "Semester_1", "Programmieren", "Abschnitt", "folie.pdf", 1,
                   store.digest(data), datetime(2026, 10, 12, tzinfo=UTC), "moodle", "resource-1")
    assert not list(outside.iterdir())


def test_state_sidecar_rejects_symlinked_directory(tmp_path):
    data_dir = tmp_path / "data"
    outside = tmp_path / "outside"
    outside.mkdir()
    root = data_dir / "uni"
    root.mkdir(parents=True)
    try:
        (root / "_file_states").symlink_to(outside, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("Symbolische Links sind auf diesem System nicht verfügbar")

    metadata = ResourceStateSidecarV1(
        source="moodle", source_key="resource-1", course_source_id="101", course_name="Programmieren",
        semester_name="Semester_1", resource_name="folie.pdf", resource_url="https://example.invalid/folie.pdf",
        observed_at=datetime(2026, 10, 12, tzinfo=UTC),
    )
    with pytest.raises(ValueError, match="symbolischer Link"):
        write_file_state_sidecar(data_dir, metadata)
    assert not list(outside.iterdir())


def test_sso_callback_must_match_passport():
    base = "https://moodle.example.invalid"
    passport = "random-passport"
    site_id = hashlib.md5((base + passport).encode()).hexdigest()
    encoded = base64.b64encode(f"{site_id}:::abc123".encode()).decode()
    callback = f"moodledl://token={encoded}"
    assert token_from_callback(callback, passport, base) == "abc123"
    assert token_from_callback(callback.rstrip("="), passport, base) == "abc123"
    with pytest.raises(ValueError):
        token_from_callback(callback, "other", base)
    assert token_from_callback(f"forcedapp://token={encoded}", passport, base) == "abc123"
    with pytest.raises(ValueError, match="Weiterleitung"):
        token_from_callback(f"forcedapp://other/path?token={encoded}", passport, base)
    with pytest.raises(ValueError, match="Weiterleitung"):
        token_from_callback(f"https://example.invalid/?token={encoded}", passport, base)
