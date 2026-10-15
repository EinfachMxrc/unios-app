# SPDX-License-Identifier: AGPL-3.0-or-later
"""A failed synthetic UI update must restore every previously installed byte."""

import sys

import pytest

from scripts import apply_local_note_link_fix as update


def test_interrupted_asset_copy_restores_verified_backup(tmp_path, monkeypatch):
    source, home = tmp_path / "source", tmp_path / "home"
    installed = home / "UniOS/_internal/frontend/dist"
    for folder in (source, installed):
        (folder / "assets").mkdir(parents=True)
    for name in ("index.html", "assets/a.js", "assets/b.js"):
        (installed / name).write_text("old-" + name)
        (source / name).write_text("new-" + name)
    previous = update.manifest(installed.resolve())
    backup = tmp_path / "backup"
    record = tmp_path / "record.json"
    monkeypatch.setenv("LOCALAPPDATA", str(home))
    monkeypatch.setattr(sys, "argv", ["update", "--source", str(source), "--backup", str(backup), "--record", str(record)])
    copy = update.shutil.copy2
    failed = False

    def interrupted(src, dst, *args, **kwargs):
        nonlocal failed
        if not failed and src == source / "assets/b.js":
            failed = True
            raise OSError("fictional interrupted copy")
        return copy(src, dst, *args, **kwargs)

    monkeypatch.setattr(update.shutil, "copy2", interrupted)
    with pytest.raises(OSError, match="fictional interrupted"):
        update.main()
    assert failed
    assert update.manifest(installed.resolve()) == previous
    assert update.manifest(backup.resolve()) == previous
    assert not record.exists()
