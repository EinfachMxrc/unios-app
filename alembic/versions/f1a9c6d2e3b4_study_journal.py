# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store editable study day reflections and course coverage.

Revision ID: f1a9c6d2e3b4
Revises: e5f6a7b8c9d0
"""

import sqlalchemy as sa

from alembic import op

revision = "f1a9c6d2e3b4"  # pragma: allowlist secret
down_revision = "e5f6a7b8c9d0"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_journal_days",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("reflection", sa.Text(), nullable=False, server_default=""),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "study_journal_courses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("covered", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("day", "course_id"),
    )
    op.create_index("ix_study_journal_courses_day", "study_journal_courses", ["day"])


def downgrade() -> None:
    op.drop_index("ix_study_journal_courses_day", table_name="study_journal_courses")
    op.drop_table("study_journal_courses")
    op.drop_table("study_journal_days")
