# SPDX-License-Identifier: AGPL-3.0-or-later

"""Versioned Markdown notes and current-revision full-text index.

Revision ID: 8e51b16cf903
Revises: 58a64007cbe1
"""

import sqlalchemy as sa

from alembic import op

revision = "8e51b16cf903"  # pragma: allowlist secret
down_revision = "58a64007cbe1"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("current_revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "note_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.String(36), sa.ForeignKey("notes.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("relative_path", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("note_id", "revision"),
    )
    op.execute("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)")


def downgrade() -> None:
    op.execute("DROP TABLE notes_fts")
    op.drop_table("note_versions")
    op.drop_table("notes")
