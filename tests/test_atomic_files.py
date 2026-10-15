# SPDX-License-Identifier: AGPL-3.0-or-later

import pytest

from app.files.atomic import ensure_directory, write_once
from app.files.localpath import native_path


def test_atomic_publication_handles_long_windows_paths_without_overwriting(tmp_path):
    folder = ensure_directory(tmp_path / "archive", *("component-" + "x" * 40 for _ in range(5)))
    target = folder / "document.json"
    assert len(str(target)) > 260
    assert write_once(target, b"complete") == target
    assert native_path(target).read_bytes() == b"complete"
    assert write_once(target, b"complete") == target
    with pytest.raises(FileExistsError):
        write_once(target, b"different")
    assert native_path(target).read_bytes() == b"complete"
    assert list(native_path(folder).glob("*.tmp")) == []
