# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store locally captured web and text clips with full-text search.

Revision ID: f3c4d5e6a7b8
Revises: f1a9c6d2e3b4
"""

import sqlalchemy as sa

from alembic import op

revision = "f3c4d5e6a7b8"  # pragma: allowlist secret
down_revision = "f1a9c6d2e3b4"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inbox_clips",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("filed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_inbox_clips_course_id", "inbox_clips", ["course_id"])
    op.execute("CREATE VIRTUAL TABLE inbox_clips_fts USING fts5(clip_id UNINDEXED, title, body, tokenize='unicode61')")


def downgrade() -> None:
    op.execute("DROP TABLE inbox_clips_fts")
    op.drop_index("ix_inbox_clips_course_id", table_name="inbox_clips")
    op.drop_table("inbox_clips")
