# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store selected read-only mail metadata and unconfirmed deadline dates.

Revision ID: f8a726d31b04
Revises: e7d62b0a4c19
"""

import sqlalchemy as sa

from alembic import op

revision = "f8a726d31b04"  # pragma: allowlist secret
down_revision = "e7d62b0a4c19"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mail_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("sender", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True)),
        sa.Column("candidate_date", sa.Date()),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("deadline_id", sa.Integer(), sa.ForeignKey("deadlines.id")),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("mail_items")
