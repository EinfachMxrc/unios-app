# SPDX-License-Identifier: AGPL-3.0-or-later

"""Remember imported AI files so retries never duplicate cards.

Revision ID: c34e1b701d29
Revises: b12c4e670a21
"""

import sqlalchemy as sa

from alembic import op

revision = "c34e1b701d29"  # pragma: allowlist secret
down_revision = "b12c4e670a21"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_outbox_receipts",
        sa.Column("sha256", sa.String(64), primary_key=True),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("card_count", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_outbox_receipts")
