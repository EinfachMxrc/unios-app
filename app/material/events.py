# SPDX-License-Identifier: AGPL-3.0-or-later

"""Rebuild the annotation lookup table from durable JSONL events."""

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, text

from app.db.models import MaterialAnnotation, Resource, ResourceVersion


def rebuild_annotation_index(factory, data_dir: Path) -> dict[str, int]:
    folder = data_dir / "annotations"
    if not folder.exists():
        with factory() as session:
            if session.scalar(select(MaterialAnnotation.id).limit(1)) is not None:
                raise ValueError("Markierungsprotokolle fehlen; alte Markierungen zuerst migrieren")
        return {"logs": 0, "events": 0, "created": 0, "updated": 0, "deleted": 0}
    latest: dict[str, dict] = {}
    revisions: dict[str, int] = {}
    deleted: set[str] = set()
    event_count = 0
    paths = sorted(folder.glob("*.jsonl"))
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise ValueError("Ungültiges Markierungsprotokoll")
        with path.open(encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, 1):
                try:
                    event = json.loads(line)
                    annotation_id = str(event["id"])
                    revision = int(event["revision"])
                    action = event["action"]
                    if str(event["resource_id"]) != path.stem or action not in {"create", "update", "delete", "reanchor"}:
                        raise ValueError
                    if revision != revisions.get(annotation_id, 0) + 1:
                        raise ValueError
                    if action == "create" and annotation_id in revisions:
                        raise ValueError
                    if action != "create" and annotation_id not in revisions:
                        raise ValueError
                    if annotation_id in deleted:
                        raise ValueError
                    if annotation_id in latest and (
                        event["source"] != latest[annotation_id]["source"]
                        or event["source_key"] != latest[annotation_id]["source_key"]
                    ):
                        raise ValueError
                except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                    raise ValueError(f"Ungültiges Markierungsereignis in {path.name}, Zeile {line_number}") from exc
                revisions[annotation_id] = revision
                event_count += 1
                if action == "delete":
                    latest.pop(annotation_id, None)
                    deleted.add(annotation_id)
                else:
                    latest[annotation_id] = event
                    deleted.discard(annotation_id)
    created = updated = removed = 0
    with factory() as session:
        legacy_columns = {row[1] for row in session.execute(text("PRAGMA table_info(material_annotations)"))}
        legacy_schema = "source_rects_json" in legacy_columns
        indexed = {item.id: item.revision for item in session.scalars(select(MaterialAnnotation)).all()}
        missing = set(indexed) - set(revisions)
        if missing:
            raise ValueError("Markierungsprotokoll fehlt; alte Markierungen zuerst migrieren")
        if any(indexed[annotation_id] > revision for annotation_id, revision in revisions.items()
               if annotation_id in indexed):
            raise ValueError("Markierungsprotokoll ist älter als der Datenbankindex")
        for annotation_id in deleted:
            item = session.get(MaterialAnnotation, annotation_id)
            if item is not None:
                session.delete(item)
                removed += 1
        for annotation_id, event in latest.items():
            resource = session.scalar(select(Resource).where(Resource.source == event["source"],
                                                              Resource.source_key == event["source_key"]))
            if resource is None:
                raise ValueError("Markierung verweist auf unbekanntes Material")
            version_id = session.scalar(select(ResourceVersion.id).where(
                ResourceVersion.resource_id == resource.id,
                ResourceVersion.version == event["source_version"]))
            if version_id is None:
                raise ValueError("Markierung verweist auf unbekannte Dateiversion")
            item = session.get(MaterialAnnotation, annotation_id)
            if item is None:
                created += 1
                if legacy_schema:
                    session.execute(text("""
                        INSERT INTO material_annotations
                            (id, resource_id, source_version_id, kind, quote, comment,
                             context_before, context_after, source_page, source_rects_json,
                             resolved, revision, created_at, updated_at)
                        VALUES (:id, :resource_id, :version_id, :kind, :quote, :comment,
                                :before, :after, :page, :rects, :resolved, :revision,
                                :created_at, :updated_at)
                    """), {"id": annotation_id, "resource_id": resource.id, "version_id": version_id,
                           "kind": event["kind"], "quote": event["quote"], "comment": event["comment"],
                           "before": event["context_before"], "after": event["context_after"],
                           "page": event["source_page"], "rects": json.dumps(event["source_rects"]),
                           "resolved": event["resolved"], "revision": event["revision"],
                           "created_at": datetime.fromisoformat(event["created_at"]),
                           "updated_at": datetime.fromisoformat(event["updated_at"])})
                    continue
                item = MaterialAnnotation(id=annotation_id)
                session.add(item)
            elif item.revision != event["revision"]:
                updated += 1
            item.resource_id = resource.id
            item.source_version_id = version_id
            item.kind = event["kind"]
            item.quote = event["quote"]
            item.comment = event["comment"]
            item.source_page = event["source_page"]
            item.resolved = event["resolved"]
            item.revision = event["revision"]
            item.created_at = datetime.fromisoformat(event["created_at"])
            item.updated_at = datetime.fromisoformat(event["updated_at"])
            if legacy_schema:
                session.flush()
                session.execute(text("""
                    UPDATE material_annotations SET context_before = :before,
                        context_after = :after, source_rects_json = :rects WHERE id = :id
                """), {"id": annotation_id, "before": event["context_before"],
                       "after": event["context_after"], "rects": json.dumps(event["source_rects"])})
        session.commit()
    return {"logs": len(paths), "events": event_count, "created": created,
            "updated": updated, "deleted": removed}
