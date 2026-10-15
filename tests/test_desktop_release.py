# SPDX-License-Identifier: AGPL-3.0-or-later
"""The release manifest must include every installer and reject mismatched versions."""

import json
import sys
from pathlib import Path

import pytest

from scripts.stage_desktop_release import main


def test_stage_desktop_release_includes_msi_and_checks_version(tmp_path, monkeypatch):
    version = json.loads((Path(__file__).resolve().parents[1] / "desktop" / "src-tauri" /
                          "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    artifacts = tmp_path / "artifacts"
    sources = {
        "windows-x64": [f"UniOS_{version}_x64-setup.exe", f"UniOS_{version}_x64.msi"],
        "macos-arm64": [f"UniOS_{version}_aarch64.app.tar.gz", f"UniOS_{version}_aarch64.dmg"],
        "macos-x64": [f"UniOS_{version}_x64.app.tar.gz", f"UniOS_{version}_x64.dmg"],
        "linux-x64": [f"UniOS_{version}_amd64.AppImage", f"UniOS_{version}_amd64.deb"],
    }
    for platform, names in sources.items():
        folder = artifacts / platform
        folder.mkdir(parents=True)
        for name in names:
            (folder / name).write_bytes(f"example {platform} {name}".encode())
            if name.endswith((".exe", ".app.tar.gz", ".AppImage")):
                (folder / f"{name}.sig").write_text("example-signature", encoding="utf-8")

    output = tmp_path / "release"
    monkeypatch.setattr(sys, "argv", ["stage_desktop_release.py", version, str(artifacts), str(output)])
    main()

    manifest = json.loads((output / "latest.json").read_text(encoding="utf-8"))
    assert manifest["version"] == version
    assert manifest["platforms"]["windows-x86_64"]["url"].endswith("windows-x86_64.exe")
    assert (output / f"UniOS-{version}-windows-x86_64.msi").is_file()
    release_info = json.loads((output / "release-info.json").read_text(encoding="utf-8"))
    assert release_info["app_version"] == version
    assert release_info["schema_version"]
    assert len((output / "SHA256SUMS.txt").read_text(encoding="ascii").splitlines()) == 9

    monkeypatch.setattr(sys, "argv", ["stage_desktop_release.py", "99.0.0", str(artifacts),
                                    str(tmp_path / "wrong-version")])
    with pytest.raises(SystemExit):
        main()
    assert not (tmp_path / "wrong-version").exists()


def test_platforms_that_were_not_built_are_left_out_of_the_update_feed(tmp_path, monkeypatch):
    version = json.loads((Path(__file__).resolve().parents[1] / "desktop" / "src-tauri" /
                          "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    artifacts = tmp_path / "artifacts"
    for platform, names in {"windows-x64": [f"UniOS_{version}_x64-setup.exe", f"UniOS_{version}_x64.msi"],
                            "linux-x64": [f"UniOS_{version}_amd64.AppImage", f"UniOS_{version}_amd64.deb"]}.items():
        (artifacts / platform).mkdir(parents=True)
        for name in names:
            (artifacts / platform / name).write_bytes(b"example")
            if name.endswith((".exe", ".AppImage")):
                (artifacts / platform / f"{name}.sig").write_text("example-signature", encoding="utf-8")

    output = tmp_path / "release"
    monkeypatch.setattr(sys, "argv", ["stage_desktop_release.py", version, str(artifacts), str(output)])
    main()

    manifest = json.loads((output / "latest.json").read_text(encoding="utf-8"))
    assert sorted(manifest["platforms"]) == ["linux-x86_64", "windows-x86_64"]

    empty = tmp_path / "none"
    empty.mkdir()
    monkeypatch.setattr(sys, "argv", ["stage_desktop_release.py", version, str(empty), str(tmp_path / "out2")])
    with pytest.raises(SystemExit):
        main()
