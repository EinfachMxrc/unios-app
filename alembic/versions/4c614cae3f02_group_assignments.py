# SPDX-License-Identifier: AGPL-3.0-or-later

"""Add manual group assignments and resource group category.

Revision ID: 4c614cae3f02
Revises: 2971e84aea78
"""
import sqlalchemy as sa

from alembic import op

revision = "4c614cae3f02"  # pragma: allowlist secret
down_revision = "2971e84aea78"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch:
        batch.add_column(sa.Column("download_other_groups", sa.Boolean(), nullable=False, server_default=sa.true()))
    with op.batch_alter_table("resources") as batch:
        batch.add_column(sa.Column("group_category", sa.String(20), nullable=False, server_default="general"))
    op.create_table(
        "section_group_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("section_id", sa.Integer(), sa.ForeignKey("course_sections.id"), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("suggested_status", sa.String(20)),
        sa.Column("needs_confirmation", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("section_group_assignments")
    with op.batch_alter_table("resources") as batch:
        batch.drop_column("group_category")
    with op.batch_alter_table("courses") as batch:
        batch.drop_column("download_other_groups")
