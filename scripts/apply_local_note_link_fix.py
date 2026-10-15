# SPDX-License-Identifier: AGPL-3.0-or-later
"""Apply a verified native UI build, retaining a complete versioned UI backup."""

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest(root: Path) -> dict[str, str]:
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            if not path.resolve().is_relative_to(root):
                raise ValueError("UI file resolves outside its directory")
            result[path.relative_to(root).as_posix()] = digest(path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--record", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    destination = (Path(os.environ["LOCALAPPDATA"]) / "UniOS/_internal/frontend/dist").resolve(strict=True)
    backup = args.backup.resolve()
    if not (source / "index.html").is_file() or (source / "sw.js").exists():
        raise ValueError("A native UI build is required")
    if backup.exists() or backup.is_relative_to(destination) or destination.is_relative_to(backup):
        raise ValueError("A new, separate versioned UI backup is required")
    previous = manifest(destination)
    expected = manifest(source)
    shutil.copytree(destination, backup)
    if manifest(backup) != previous:
        raise ValueError("Backup verification failed; installed UI has not been changed")
    copied = []
    touched = []
    staged_index = destination / "index.note-link-fix.next.html"
    if staged_index.exists():
        raise ValueError("An earlier staged entry page requires review")
    try:
        for name, checksum in expected.items():
            if name == "index.html" or previous.get(name) == checksum:
                continue
            target = destination / name
            if not target.resolve().is_relative_to(destination):
                raise ValueError("Destination resolves outside installed UI")
            target.parent.mkdir(parents=True, exist_ok=True)
            touched.append(name)  # A failed copy may already have truncated its target.
            shutil.copy2(source / name, target)
            if digest(target) != checksum:
                raise ValueError("Copied asset verification failed")
            copied.append(name)
        shutil.copy2(source / "index.html", staged_index)
        if digest(staged_index) != expected["index.html"]:
            raise ValueError("Entry page verification failed")
        touched.append("index.html")
        staged_index.replace(destination / "index.html")
        for name, checksum in expected.items():
            if digest(destination / name) != checksum:
                raise ValueError("Installed UI verification failed")
    except BaseException:
        # Restore modified existing files from the verified versioned backup.
        # Newly copied assets are harmless without the new entry page and stay
        # available for diagnosis; no original or backup file is deleted.
        for name in reversed(touched):
            if name in previous:
                target = destination / name
                staged = target.with_name(target.name + ".rollback-next")
                shutil.copy2(backup / name, staged)
                if digest(staged) != previous[name]:
                    raise OSError("UI rollback verification failed; retain the backup") from None
                staged.replace(target)
        if any(digest(destination / name) != checksum for name, checksum in previous.items()):
            raise OSError("UI rollback incomplete; retain the backup") from None
        raise
    record = {"previous": previous, "installed_build": expected,
              "copied_assets": copied, "backup": str(backup),
              "entry_page_sha256": expected["index.html"],
              "verified_files": len(expected)}
    args.record.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"verified_files": len(expected), "copied_assets": len(copied),
                      "entry_page_sha256": expected["index.html"], "backup_verified": True}))


if __name__ == "__main__":
    main()
