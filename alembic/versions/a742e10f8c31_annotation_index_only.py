# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep full annotation anchors only in the append-only JSONL journal.

Revision ID: a742e10f8c31
Revises: f6b57d5e0a12
"""

import json
from pathlib import Path

import sqlalchemy as sa

from alembic import context, op
from app.config import get_settings

revision = "a742e10f8c31"  # pragma: allowlist secret
down_revision = "f6b57d5e0a12"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def _latest_events(folder: Path) -> dict[str, dict]:
    events: dict[str, list[dict]] = {}
    if folder.is_symlink():
        raise RuntimeError("Ungültiges Markierungsverzeichnis; Migration abgebrochen")
    if not folder.is_dir():
        return {}
    for path in sorted(folder.glob("*.jsonl")):
        if path.is_symlink() or not path.is_file():
            raise RuntimeError("Ungültiges Markierungsprotokoll; Migration abgebrochen")
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                try:
                    event = json.loads(line)
                    if (not isinstance(event, dict) or str(event["resource_id"]) != path.stem
                            or not isinstance(event["id"], str)
                            or event["action"] not in {"create", "update", "reanchor", "delete"}
                            or not isinstance(event["context_before"], str)
                            or not isinstance(event["context_after"], str)
                            or not isinstance(event["source_rects"], list)):
                        raise ValueError
                    events.setdefault(event["id"], []).append(event)
                except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                    raise RuntimeError("Markierungsprotokoll beschädigt; Migration abgebrochen") from exc
    latest = {}
    for annotation_id, history in events.items():
        try:
            history.sort(key=lambda event: event["revision"])
            if [event["revision"] for event in history] != list(range(1, len(history) + 1)):
                raise ValueError
            if (history[0]["action"] != "create"
                    or any(event["action"] == "create" for event in history[1:])
                    or any(event["action"] == "delete" for event in history[:-1])
                    or len({(event["source"], event["source_key"]) for event in history}) != 1):
                raise ValueError
            latest[annotation_id] = history[-1]
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("Markierungsrevisionen unvollständig; Migration abgebrochen") from exc
    return latest


def _verify_journals() -> dict[str, dict]:
    settings = context.config.attributes.get("settings") or get_settings()
    latest = _latest_events(settings.data_dir / "annotations")
    rows = op.get_bind().execute(sa.text("""
        SELECT a.id, a.revision, a.kind, a.quote, a.comment, a.context_before,
               a.context_after, a.source_page, a.source_rects_json, a.resolved,
               r.source, r.source_key, v.version AS source_version
        FROM material_annotations AS a
        JOIN resources AS r ON r.id = a.resource_id
        JOIN resource_versions AS v ON v.id = a.source_version_id
    """)).mappings().all()
    indexed_ids = {row["id"] for row in rows}
    active_ids = {annotation_id for annotation_id, event in latest.items()
                  if event.get("action") != "delete"}
    if indexed_ids - active_ids:
        raise RuntimeError("Markierungen zuerst mit 'unios migrate-annotations' ins JSONL-Protokoll "
                           "übernehmen; Migration abgebrochen")
    if (active_ids - indexed_ids or indexed_ids != {
            row[0] for row in op.get_bind().execute(sa.text("SELECT id FROM material_annotations"))}):
        raise RuntimeError("Markierungsindex zuerst mit 'unios rebuild-annotations' abgleichen; "
                           "Migration abgebrochen")
    for row in rows:
        event = latest.get(row["id"])
        try:
            valid = event is not None and all((
                event["action"] != "delete",
                event["revision"] == row["revision"],
                event["kind"] == row["kind"],
                event["quote"] == row["quote"],
                event["comment"] == row["comment"],
                event["context_before"] == row["context_before"],
                event["context_after"] == row["context_after"],
                event["source_page"] == row["source_page"],
                event["source_rects"] == json.loads(row["source_rects_json"]),
                event["resolved"] == bool(row["resolved"]),
                event["source"] == row["source"],
                event["source_key"] == row["source_key"],
                event["source_version"] == row["source_version"],
            ))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            valid = False
        if not valid:
            raise RuntimeError("Markierungen zuerst mit 'unios migrate-annotations' ins JSONL-Protokoll "
                               "übernehmen und den Index prüfen; Migration abgebrochen")
    return latest


def _drop_annotation_search() -> None:
    for name in ("material_annotations_ai", "material_annotations_ad", "material_annotations_au"):
        op.execute(f"DROP TRIGGER {name}")
    op.execute("DROP TABLE material_annotations_fts")


def _create_annotation_search() -> None:
    op.execute("CREATE VIRTUAL TABLE material_annotations_fts USING "
               "fts5(quote, comment, content='material_annotations', content_rowid='rowid')")
    op.execute("CREATE TRIGGER material_annotations_ai AFTER INSERT ON material_annotations BEGIN "
               "INSERT INTO material_annotations_fts(rowid, quote, comment) "
               "VALUES (new.rowid, new.quote, new.comment); END")
    op.execute("CREATE TRIGGER material_annotations_ad AFTER DELETE ON material_annotations BEGIN "
               "INSERT INTO material_annotations_fts(material_annotations_fts, rowid, quote, comment) "
               "VALUES ('delete', old.rowid, old.quote, old.comment); END")
    op.execute("CREATE TRIGGER material_annotations_au AFTER UPDATE ON material_annotations BEGIN "
               "INSERT INTO material_annotations_fts(material_annotations_fts, rowid, quote, comment) "
               "VALUES ('delete', old.rowid, old.quote, old.comment); "
               "INSERT INTO material_annotations_fts(rowid, quote, comment) "
               "VALUES (new.rowid, new.quote, new.comment); END")
    op.execute("INSERT INTO material_annotations_fts(material_annotations_fts) VALUES ('rebuild')")


def upgrade() -> None:
    _verify_journals()  # No schema change if any source event is missing or stale.
    _drop_annotation_search()
    with op.batch_alter_table("material_annotations", recreate="always") as batch:
        batch.drop_column("context_before")
        batch.drop_column("context_after")
        batch.drop_column("source_rects_json")
    _create_annotation_search()


def downgrade() -> None:
    latest = _latest_events((context.config.attributes.get("settings") or get_settings()).data_dir / "annotations")
    rows = op.get_bind().execute(sa.text("SELECT id, revision FROM material_annotations")).all()
    for annotation_id, annotation_revision in rows:
        event = latest.get(annotation_id)
        if (event is None or event.get("action") == "delete"
                or event.get("revision") != annotation_revision
                or not all(key in event for key in ("context_before", "context_after", "source_rects"))):
            raise RuntimeError("Markierungsprotokoll fehlt; Rückmigration abgebrochen")
    _drop_annotation_search()
    with op.batch_alter_table("material_annotations", recreate="always") as batch:
        batch.add_column(sa.Column("context_before", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("context_after", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("source_rects_json", sa.Text(), nullable=False, server_default="[]"))
    connection = op.get_bind()
    for annotation_id, _ in rows:
        event = latest[annotation_id]
        connection.execute(sa.text("""
            UPDATE material_annotations SET context_before = :before, context_after = :after,
                source_rects_json = :rects WHERE id = :id
        """), {"before": event["context_before"], "after": event["context_after"],
               "rects": json.dumps(event["source_rects"]), "id": annotation_id})
    _create_annotation_search()
