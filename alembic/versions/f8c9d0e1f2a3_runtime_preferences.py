# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persist safe runtime preferences separately from credentials.

Revision ID: f8c9d0e1f2a3
Revises: f7b8c9d0e1f2
"""

import sqlalchemy as sa

from alembic import op

revision = "f8c9d0e1f2a3"  # pragma: allowlist secret
down_revision = "f7b8c9d0e1f2"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runtime_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("runtime_preferences")
