# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep private audio with editable transcript and course/topic links.

Revision ID: f7b8c9d0e1f2
Revises: f6a7b8c9d0e1
"""

import sqlalchemy as sa

from alembic import op

revision = "f7b8c9d0e1f2"  # pragma: allowlist secret
down_revision = "f6a7b8c9d0e1"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voice_memos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=False, server_default=""),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id")),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("learning_topics.id")),
        sa.Column("jot_id", sa.String(36), sa.ForeignKey("jots.id"), unique=True),
        sa.Column("relative_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("voice_memos")
