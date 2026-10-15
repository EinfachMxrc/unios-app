# SPDX-License-Identifier: AGPL-3.0-or-later

"""Attach a small set of user properties to existing study objects.

Revision ID: f6a7b8c9d0e1
Revises: f5e6a7b8c9d0
"""

import sqlalchemy as sa

from alembic import op

revision = "f6a7b8c9d0e1"  # pragma: allowlist secret
down_revision = "f5e6a7b8c9d0"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, column_type in (
        ("tag", sa.String(40)), ("priority", sa.String(20)), ("exam_relevant", sa.Boolean()),
        ("difficulty", sa.String(20)), ("workflow_status", sa.String(30)),
    ):
        op.add_column("smart_collections", sa.Column(name, column_type))
    op.create_table(
        "object_metadata",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("object_type", sa.String(30), nullable=False),
        sa.Column("object_id", sa.String(80), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("priority", sa.String(20)),
        sa.Column("exam_relevant", sa.Boolean()),
        sa.Column("difficulty", sa.String(20)),
        sa.Column("workflow_status", sa.String(30)),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("object_type", "object_id"),
    )


def downgrade() -> None:
    op.drop_table("object_metadata")
    for name in ("workflow_status", "difficulty", "exam_relevant", "priority", "tag"):
        op.drop_column("smart_collections", name)
