# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persist proposed exam study cycles and measurable goals.

Revision ID: f9f2a3b4c5d6
Revises: f9e1f2a3b4c5
"""

import sqlalchemy as sa

from alembic import op

revision = "f9f2a3b4c5d6"  # pragma: allowlist secret
down_revision = "f9e1f2a3b4c5"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_cycles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("phase", sa.String(20), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exam_at_snapshot", sa.DateTime(timezone=True), nullable=False),
        sa.Column("topic_ids", sa.JSON(), nullable=False),
        sa.Column("review_goal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempt_goal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="proposed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("exam_id", "phase"),
    )
    op.create_index("ix_study_cycles_exam_id", "study_cycles", ["exam_id"])


def downgrade() -> None:
    op.drop_index("ix_study_cycles_exam_id", table_name="study_cycles")
    op.drop_table("study_cycles")
