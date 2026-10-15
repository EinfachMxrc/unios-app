# SPDX-License-Identifier: AGPL-3.0-or-later

"""Move old revision snapshots into the append-only annotation journal."""

import json
import os
import sqlite3
from collections import defaultdict
from contextlib import closing
from pathlib import Path
from uuid import UUID

from filelock import FileLock
from sqlalchemy import select

from app.db.models import MaterialAnnotation, Resource, ResourceVersion
from app.files.atomic import ensure_directory
from app.host.snapshots import verified_handoff_snapshot


def _legacy_revisions(folder: Path, item: MaterialAnnotation, resource: Resource,
                      versions: dict[int, ResourceVersion]) -> list[dict]:
    try:
        UUID(item.id)
    except ValueError as exc:
        raise ValueError("Alte Markierung hat keine gültige Kennung") from exc
    old_dir = folder / str(item.resource_id) / item.id
    if old_dir.is_symlink() or not old_dir.is_dir():
        raise ValueError("Alte Markierung hat kein gültiges Revisionsverzeichnis")
    events = []
    for revision in range(1, item.revision + 1):
        path = old_dir / f"{revision:04d}.json"
        if path.is_symlink() or not path.is_file():
            raise ValueError("Alte Markierung hat eine fehlende oder ungültige Revision")
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
            version = versions[old["source_version_id"]]
            if (old["id"] != item.id or old["resource_id"] != item.resource_id
                    or old["revision"] != revision or version.resource_id != item.resource_id):
                raise ValueError
            events.append({**old, "action": "create" if revision == 1 else "update",
                           "source": resource.source, "source_key": resource.source_key,
                           "source_version": version.version})
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("Alte Markierungsrevision ist ungültig") from exc
    latest = events[-1]
    if (latest["quote"] != item.quote or latest["comment"] != item.comment
            or latest["resolved"] != item.resolved or latest["source_version_id"] != item.source_version_id):
        raise ValueError("Alte Markierung und Datenbank stimmen nicht überein")
    return events


def _journal_revisions(path: Path) -> dict[str, int]:
    revisions: dict[str, int] = {}
    if not path.exists():
        return revisions
    if path.is_symlink() or not path.is_file():
        raise ValueError("Ungültiges Markierungsprotokoll")
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
            annotation_id = str(event["id"])
            revision = int(event["revision"])
            if str(event["resource_id"]) != path.stem or revision != revisions.get(annotation_id, 0) + 1:
                raise ValueError
            revisions[annotation_id] = revision
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("Ungültiges Markierungsprotokoll") from exc
    return revisions


def migrate_legacy_annotations(factory, data_dir: Path, *, generation: int,
                               device_id: str) -> dict[str, int]:
    """Require Marc's verified snapshot before appending any legacy events."""
    folder = data_dir / "host" / "snapshots"
    manifest = verified_handoff_snapshot(folder, generation=generation, device_id=device_id,
                                         max_age_seconds=24 * 60 * 60)
    old_folder = data_dir / "annotations"
    with factory() as session:
        items = session.scalars(select(MaterialAnnotation).order_by(MaterialAnnotation.resource_id,
                                                                   MaterialAnnotation.id)).all()
        resources = {item.id: item for item in session.scalars(select(Resource)).all()}
        versions = {item.id: item for item in session.scalars(select(ResourceVersion)).all()}
        plans: dict[int, list[dict]] = defaultdict(list)
        with closing(sqlite3.connect(f"{(folder / manifest.filename).resolve().as_uri()}?mode=ro&immutable=1",
                                     uri=True)) as snapshot:
            saved = {row[0]: row[1] for row in snapshot.execute("SELECT id, revision FROM material_annotations")}
        for item in items:
            resource = resources.get(item.resource_id)
            if resource is None:
                raise ValueError("Markierung verweist auf unbekanntes Material")
            path = old_folder / f"{item.resource_id}.jsonl"
            current_revision = _journal_revisions(path).get(item.id, 0)
            if current_revision == item.revision:
                continue
            if saved.get(item.id) != item.revision:
                raise ValueError("Geprüfter Snapshot enthält nicht den aktuellen Markierungsstand")
            events = _legacy_revisions(old_folder, item, resource, versions)
            if current_revision > item.revision:
                raise ValueError("Markierungsprotokoll ist neuer als die Datenbank")
            plans[item.resource_id].extend(events[current_revision:])

    migrated = 0
    written = 0
    for resource_id, events in sorted(plans.items()):
        lock_folder = ensure_directory(old_folder / "locks")
        with FileLock(lock_folder / f"{resource_id}.lock", timeout=5):
            path = old_folder / f"{resource_id}.jsonl"
            current_revisions = _journal_revisions(path)
            pending = [event for event in events if event["revision"] > current_revisions.get(event["id"], 0)]
            if not pending:
                continue
            flags = os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
            with os.fdopen(os.open(path, flags, 0o600), "ab", buffering=0) as stream:
                for event in pending:
                    stream.write((json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))
                    written += 1
                os.fsync(stream.fileno())
            migrated += len({event["id"] for event in pending})
    return {"annotations_migrated": migrated, "events_written": written}
