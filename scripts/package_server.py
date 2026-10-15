# SPDX-License-Identifier: AGPL-3.0-or-later
"""Package only application source for a server build, never a user's data."""

import argparse
import io
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = ("app/", "config/", "institutions/", "clients/", "alembic/", "frontend/", "deploy/server/", "docs/licenses/")
ROOT_FILES = {"pyproject.toml", "uv.lock", "alembic.ini", ".dockerignore", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "desktop/backend.py"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    # Restrict Git traversal itself, not just archive membership afterwards:
    # unrelated test archives and personal workspace folders are never scanned.
    listed = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z",
                                      "--", *DIRECTORIES, *sorted(ROOT_FILES)], cwd=ROOT)
    candidates = sorted({name.decode("utf-8") for name in listed.split(b"\0") if name})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.output, "x:gz") as archive:
        for name in candidates:
            if name not in ROOT_FILES and not name.startswith(DIRECTORIES):
                continue
            path = ROOT / name
            if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
                raise ValueError("Ungültiger Quellpfad")
            if path.suffix == '.sh':
                # Windows working trees may retain CRLF despite Git's LF policy.
                # Bash bootstrap scripts in a Linux release must always use LF.
                body = path.read_bytes().replace(b'\r\n', b'\n')
                metadata = archive.gettarinfo(str(path), arcname=name)
                metadata.size = len(body)
                archive.addfile(metadata, io.BytesIO(body))
            else:
                archive.add(path, arcname=name, recursive=False)
    print("UniOS-Quellpaket erstellt; keine Nutzerdaten enthalten")


if __name__ == "__main__":
    main()
