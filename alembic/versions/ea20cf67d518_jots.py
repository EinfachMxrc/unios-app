# SPDX-License-Identifier: AGPL-3.0-or-later

"""Offline-safe quick captures and full-text search.

Revision ID: ea20cf67d518
Revises: 8e51b16cf903
"""

import sqlalchemy as sa

from alembic import op

revision = "ea20cf67d518"  # pragma: allowlist secret
down_revision = "8e51b16cf903"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("note_id", sa.String(36), sa.ForeignKey("notes.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("CREATE VIRTUAL TABLE jots_fts USING fts5(jot_id UNINDEXED, body)")


def downgrade() -> None:
    op.execute("DROP TABLE jots_fts")
    op.drop_table("jots")
