# SPDX-License-Identifier: AGPL-3.0-or-later

"""Save safe, typed views over existing study records.

Revision ID: f4d5e6a7b8c9
Revises: f2b3c4d5e6a7
"""

import sqlalchemy as sa

from alembic import op

revision = "f4d5e6a7b8c9"  # pragma: allowlist secret
down_revision = "f2b3c4d5e6a7"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smart_collections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("view", sa.String(20), nullable=False, server_default="list"),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("days", sa.Integer(), nullable=True),
        sa.Column("max_percent", sa.Integer(), nullable=True),
        sa.Column("own_group_only", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("include_unmeasured", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort", sa.String(20), nullable=False, server_default="date"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("smart_collections")
