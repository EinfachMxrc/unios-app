# SPDX-License-Identifier: AGPL-3.0-or-later

"""Rule-based study block suggestions ahead of exams, accepted ones join the iCal feed.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
"""

import sqlalchemy as sa

from alembic import op

revision = "b2c3d4e5f6a7"  # pragma: allowlist secret
down_revision = "a1b2c3d4e5f6"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_block_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("learning_topics.id"), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("exam_id", "topic_id", name="uq_study_block_exam_topic"),
    )


def downgrade() -> None:
    op.drop_table("study_block_suggestions")
