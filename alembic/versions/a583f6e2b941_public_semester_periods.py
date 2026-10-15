# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store official semester periods with date precision.

Revision ID: a583f6e2b941
Revises: 79c4e2b801fa
"""

import sqlalchemy as sa

from alembic import op

revision = "a583f6e2b941"  # pragma: allowlist secret
down_revision = "79c4e2b801fa"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "public_semester_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("semester", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source_url", "semester", "kind"),
    )


def downgrade() -> None:
    op.drop_table("public_semester_periods")
