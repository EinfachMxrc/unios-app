# SPDX-License-Identifier: AGPL-3.0-or-later

"""Add generic links between study objects.

Revision ID: 9d1a65f35b28
Revises: 4a52c97b0d10
"""

import sqlalchemy as sa

from alembic import op

revision = "9d1a65f35b28"  # pragma: allowlist secret
down_revision = "4a52c97b0d10"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("from_type", sa.String(40), nullable=False),
        sa.Column("from_id", sa.String(36), nullable=False),
        sa.Column("to_type", sa.String(40), nullable=False),
        sa.Column("to_id", sa.String(36), nullable=False),
        sa.Column("relation", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("from_type", "from_id", "to_type", "to_id", "relation"),
    )
    for name in ("from_type", "from_id", "to_type", "to_id"):
        op.create_index(f"ix_links_{name}", "links", [name])


def downgrade() -> None:
    op.drop_table("links")
