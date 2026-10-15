# SPDX-License-Identifier: AGPL-3.0-or-later

"""Track monthly token usage per model for the optional, disabled-by-default AI adapter.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

import sqlalchemy as sa

from alembic import op

revision = "c3d4e5f6a7b8"  # pragma: allowlist secret
down_revision = "b2c3d4e5f6a7"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("tokens_used", sa.Integer(), nullable=False),
        sa.UniqueConstraint("month", "model", name="uq_ai_usage_month_model"),
    )


def downgrade() -> None:
    op.drop_table("ai_usage")
