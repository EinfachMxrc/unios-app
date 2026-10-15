# SPDX-License-Identifier: AGPL-3.0-or-later
"""Prüft das feste Quellpaket; optional ausschließlich in neuen Ordner entpacken."""
import argparse
import hashlib
import json
import shutil
import tarfile
from pathlib import Path, PurePosixPath

COMMIT = "bf978b23267ab9e2e5ed1d480a343b8bae45c2f1"  # pragma: allowlist secret (public Git commit)
DIGEST = "31aefa4979b1dd7564ad2f32428d18ba4122fd5028286cdb23b4755cfab6132b"  # pragma: allowlist secret (public archive checksum)
NAME = "UniOS-0.1.23-server-source-bf978b2-files.tar.gz"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--extract", type=Path, help="Neuer, bisher nicht vorhandener Zielordner")
args = parser.parse_args()
folder = Path(__file__).resolve().parent
archive = folder / NAME
manifest = json.loads((folder / NAME.replace("-files.tar.gz", "-manifest.json")).read_text())
assert manifest["source_commit"] == COMMIT
assert manifest["archive"] == NAME and manifest["archive_sha256"] == DIGEST
assert hashlib.sha256(archive.read_bytes()).hexdigest() == DIGEST, "Prüfsumme stimmt nicht"
roots = {"pyproject.toml", "uv.lock", "alembic.ini", ".dockerignore", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "desktop/backend.py"}
prefixes = ("app/", "config/", "institutions/", "clients/", "alembic/", "frontend/", "deploy/server/", "docs/licenses/")
with tarfile.open(archive, "r:gz") as package:
    members = package.getmembers()
    names = [item.name for item in members]
    assert len(names) == len(set(names)) == manifest["source_files"]
    assert sum(item.size for item in members) == manifest["source_bytes"] < 512 * 1024 * 1024
    for item in members:
        path = PurePosixPath(item.name)
        assert item.isfile() and not path.is_absolute() and ".." not in path.parts
        assert item.name in roots or item.name.startswith(prefixes)
        assert 0 <= item.size <= 64 * 1024 * 1024
        assert not any(part in {"data", "local", ".git", "node_modules", "test-results", "playwright-report"} or part.startswith(".env") for part in path.parts)
    if args.extract:
        args.extract.mkdir(mode=0o700, parents=False, exist_ok=False)
        for item in members:
            target = args.extract / item.name
            target.parent.mkdir(parents=True, exist_ok=True)
            source = package.extractfile(item)
            assert source is not None
            with source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
print("Paket geprüft: UniOS 0.1.23 / bf978b2 / 1459 Quelldateien")
