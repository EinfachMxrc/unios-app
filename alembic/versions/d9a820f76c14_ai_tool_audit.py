# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep a small local audit trail for MCP tool calls.

Revision ID: d9a820f76c14
Revises: c34e1b701d29
"""

import sqlalchemy as sa

from alembic import op

revision = "d9a820f76c14"  # pragma: allowlist secret
down_revision = "c34e1b701d29"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_tool_access",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("accessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tool", sa.String(80), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("permitted", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_tool_access")
