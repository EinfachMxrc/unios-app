# SPDX-License-Identifier: AGPL-3.0-or-later

"""Index annotations and course text with SQLite FTS5.

Revision ID: 4a52c97b0d10
Revises: 6f4c0aa2d2bf
"""

from alembic import op

revision = "4a52c97b0d10"  # pragma: allowlist secret
down_revision = "6f4c0aa2d2bf"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
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

    op.execute("CREATE VIRTUAL TABLE course_scratchpads_fts USING "
               "fts5(body, content='course_scratchpads', content_rowid='course_id')")
    op.execute("CREATE TRIGGER course_scratchpads_ai AFTER INSERT ON course_scratchpads BEGIN "
               "INSERT INTO course_scratchpads_fts(rowid, body) VALUES (new.course_id, new.body); END")
    op.execute("CREATE TRIGGER course_scratchpads_ad AFTER DELETE ON course_scratchpads BEGIN "
               "INSERT INTO course_scratchpads_fts(course_scratchpads_fts, rowid, body) "
               "VALUES ('delete', old.course_id, old.body); END")
    op.execute("CREATE TRIGGER course_scratchpads_au AFTER UPDATE ON course_scratchpads BEGIN "
               "INSERT INTO course_scratchpads_fts(course_scratchpads_fts, rowid, body) "
               "VALUES ('delete', old.course_id, old.body); "
               "INSERT INTO course_scratchpads_fts(rowid, body) VALUES (new.course_id, new.body); END")
    op.execute("INSERT INTO course_scratchpads_fts(course_scratchpads_fts) VALUES ('rebuild')")


def downgrade() -> None:
    for name in ("material_annotations_ai", "material_annotations_ad", "material_annotations_au",
                 "course_scratchpads_ai", "course_scratchpads_ad", "course_scratchpads_au"):
        op.execute(f"DROP TRIGGER {name}")
    op.execute("DROP TABLE material_annotations_fts")
    op.execute("DROP TABLE course_scratchpads_fts")
