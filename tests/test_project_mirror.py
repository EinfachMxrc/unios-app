# SPDX-License-Identifier: AGPL-3.0-or-later

"""A mirror fetch keeps earlier refs and never pushes to its source."""

import json
import subprocess
from pathlib import Path

from app.projects.mirror import mirror_repository


def git(*arguments: str, cwd: Path) -> str:
    result = subprocess.run(["git", *arguments], cwd=cwd, capture_output=True, text=True,
                            encoding="utf-8", check=True)
    return result.stdout.strip()


def test_mirror_keeps_both_fetched_versions_without_changing_remote(settings, tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    git("init", "-b", "main", cwd=source)
    git("config", "user.name", "Fixture", cwd=source)
    git("config", "user.email", "fixture@example.invalid", cwd=source)
    document = source / "README.md"
    document.write_text("Erste Version\n", encoding="utf-8")
    git("add", "README.md", cwd=source)
    git("commit", "-m", "erste Version", cwd=source)
    first_head = git("rev-parse", "HEAD", cwd=source)
    remote = tmp_path / "remote.git"
    git("clone", "--bare", str(source), str(remote), cwd=tmp_path)

    first = mirror_repository(settings, 1, "team/repo", test_remote=str(remote), test_protocol="file")
    assert first.head == first_head and first.refs_count >= 1
    first_manifest = json.loads((settings.data_dir / first.manifest_path).read_text(encoding="utf-8"))
    assert first_manifest["refs"]["refs/heads/main"] == first_head

    document.write_text("Zweite Version\n", encoding="utf-8")
    git("commit", "-am", "zweite Version", cwd=source)
    second_head = git("rev-parse", "HEAD", cwd=source)
    git("push", "--quiet", str(remote), "main", cwd=source)
    second = mirror_repository(settings, 1, "team/repo", test_remote=str(remote), test_protocol="file")
    assert second.head == second_head and second.head != first.head
    mirror = settings.data_dir / "projects" / "mirrors" / "repos" / "1.git"
    assert git("show-ref", "--verify", f"refs/unios/snapshots/{first_manifest['snapshot_id']}/heads/main",
               cwd=mirror).startswith(first_head)
    assert (settings.data_dir / first.manifest_path).is_file()
    assert (settings.data_dir / second.manifest_path).is_file()
    assert git("rev-parse", "HEAD", cwd=remote) == second_head
