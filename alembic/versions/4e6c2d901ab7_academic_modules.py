# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep manual and future portal module results with revision history.

Revision ID: 4e6c2d901ab7
Revises: 7b690dc715cf
"""

import sqlalchemy as sa

from alembic import op

revision = "4e6c2d901ab7"  # pragma: allowlist secret
down_revision = "7b690dc715cf"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academic_modules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("source_key", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("semester_id", sa.Integer(), sa.ForeignKey("semesters.id")),
        sa.Column("ects_hundredths", sa.Integer(), nullable=False),
        sa.Column("grade_hundredths", sa.Integer()),
        sa.Column("weight_hundredths", sa.Integer()),
        sa.Column("attempt", sa.Integer()),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source", "source_key"),
    )
    op.create_index("ix_academic_modules_semester_id", "academic_modules", ["semester_id"])
    op.create_table(
        "academic_module_revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("academic_modules.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("module_id", "revision"),
    )
    op.create_index("ix_academic_module_revisions_module_id", "academic_module_revisions", ["module_id"])


def downgrade() -> None:
    op.drop_index("ix_academic_module_revisions_module_id", table_name="academic_module_revisions")
    op.drop_table("academic_module_revisions")
    op.drop_index("ix_academic_modules_semester_id", table_name="academic_modules")
    op.drop_table("academic_modules")
