# SPDX-License-Identifier: AGPL-3.0-or-later

"""Build the complete personal-data export ZIP for one device.

Self-hosting users must be able to take their data with them: a consistent
copy of the SQLite database plus every user-created file, wrapped in a
single archive with a manifest that proves nothing was silently dropped or
corrupted. Building the archive never requires the writer lease -- it only
reads -- so it also works while this device is on standby.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy.engine import make_url

from app.anki.collection import snapshot_collection
from app.config import Settings
from app.export.portable import anki_csv, readable_files
from app.host.snapshots import backup_sqlite_copy

# Folders under DATA_DIR that hold data the user created or received and
# would otherwise lose. Deliberately an allowlist, not "everything in
# DATA_DIR except known secrets": a new file kind must be added here on
# purpose before it is ever exported, so a future feature cannot leak a new
# secret file into a user's export by accident.
#
# Journal entries, inbox clips, and jots live only in the SQLite database
# and need no folder here. Host snapshots/leases, sync mirrors of external
# repositories, and derived caches (PDF previews, Anki packages) are
# regenerable or host-internal, not personal data, and are excluded.
USER_DATA_FOLDERS: tuple[str, ...] = (
    "annotations",
    "notes",
    "note-media",
    "ai/inbox",
    "ai/outbox",
    "drop",
    "submissions",
    "voice",
    "projects/mirrors/snapshots",
)

# Downloaded course material lives under DATA_DIR/uni; it can be large, so
# it is only included when the caller opts in via ``include_files``.
MATERIAL_FOLDER = "uni"

DATABASE_ARCNAME = "database/uni_os.sqlite3"
MANIFEST_ARCNAME = "manifest.json"


def _app_version() -> str:
    try:
        return package_version("unios")
    except PackageNotFoundError:
        return "0.0.0-dev"


def _schema_head_revision() -> str | None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    project_root = Path(__file__).resolve().parents[2]
    config = Config(str(project_root / "alembic.ini"))
    config.set_main_option("script_location", str(project_root / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _iter_folder_files(data_dir: Path, folder: str) -> Iterator[tuple[Path, str]]:
    root = data_dir / folder
    if not root.is_dir() or root.is_symlink():
        return
    resolved_root = root.resolve()
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        if not path.resolve().is_relative_to(resolved_root):
            continue
        arcname = f"data/{path.relative_to(data_dir).as_posix()}"
        yield path, arcname


def build_export(settings: Settings, target: Path, *, include_files: bool) -> Path:
    """Write a self-contained export ZIP to ``target``.

    ``target`` must not already exist; the caller owns placing it in a
    private, disposable location (a fresh temp directory for the API, the
    user's chosen path for the CLI) and cleaning it up afterwards. Large
    course material is streamed straight from disk into the archive, never
    fully loaded into memory.
    """
    database_value = make_url(settings.database_url).database
    if not database_value or database_value == ":memory:":
        raise ValueError("Export benötigt eine SQLite-Datei")
    database_path = Path(database_value).resolve()
    if not database_path.is_file():
        raise FileNotFoundError("Datenbank fehlt")

    manifest_files: list[dict[str, object]] = []
    db_copy = target.with_name(f"{target.name}.db.tmp")
    anki_copy = target.with_name(f"{target.name}.anki.tmp")
    try:
        backup_sqlite_copy(database_path, db_copy)
        has_anki = snapshot_collection(settings, anki_copy)
        with ZipFile(target, "x", compression=ZIP_DEFLATED) as archive:
            archive.write(db_copy, DATABASE_ARCNAME)
            manifest_files.append({"path": DATABASE_ARCNAME, "sha256": _sha256(db_copy),
                                   "size": db_copy.stat().st_size})

            for arcname, content in readable_files(db_copy, settings.data_dir, settings):
                archive.writestr(arcname, content)
                manifest_files.append({"path": arcname, "sha256": hashlib.sha256(content).hexdigest(), "size": len(content)})
            if has_anki:
                archive.write(anki_copy, "anki/collection.anki2")
                manifest_files.append({"path": "anki/collection.anki2", "sha256": _sha256(anki_copy), "size": anki_copy.stat().st_size})
                content = anki_csv(anki_copy)
                archive.writestr("portable/anki-notes.csv", content)
                manifest_files.append({"path": "portable/anki-notes.csv", "sha256": hashlib.sha256(content).hexdigest(), "size": len(content)})
                for path, name in _iter_folder_files(settings.local_dir, "anki/collection.media"):
                    arcname = name.removeprefix("data/")
                    archive.write(path, arcname)
                    manifest_files.append({"path": arcname, "sha256": _sha256(path), "size": path.stat().st_size})

            for folder in USER_DATA_FOLDERS:
                for path, arcname in _iter_folder_files(settings.data_dir, folder):
                    archive.write(path, arcname)
                    manifest_files.append({"path": arcname, "sha256": _sha256(path),
                                           "size": path.stat().st_size})

            if include_files:
                for path, arcname in _iter_folder_files(settings.data_dir, MATERIAL_FOLDER):
                    archive.write(path, arcname)
                    manifest_files.append({"path": arcname, "sha256": _sha256(path),
                                           "size": path.stat().st_size})

            manifest = {
                "exported_at": datetime.now(UTC).isoformat(),
                "app_version": _app_version(),
                "schema_head_revision": _schema_head_revision(),
                "include_files": include_files,
                "files": manifest_files,
            }
            archive.writestr(MANIFEST_ARCNAME, json.dumps(manifest, ensure_ascii=False, indent=2))
    finally:
        db_copy.unlink(missing_ok=True)
        anki_copy.unlink(missing_ok=True)
    return target
