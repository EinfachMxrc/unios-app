# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep a history of read-only PRIMUSS enrollment checks.

Revision ID: 60d49172efad
Revises: 4e6c2d901ab7
"""

import sqlalchemy as sa

from alembic import op

revision = "60d49172efad"  # pragma: allowlist secret
down_revision = "4e6c2d901ab7"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "enrollment_checks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_key", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True)),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_enrollment_checks_source_key", "enrollment_checks", ["source_key"])


def downgrade() -> None:
    op.drop_index("ix_enrollment_checks_source_key", table_name="enrollment_checks")
    op.drop_table("enrollment_checks")
