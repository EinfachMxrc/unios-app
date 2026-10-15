# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store weekly summaries and the digest preference.

Revision ID: a84b67d71910
Revises: 9d1a65f35b28
"""

import sqlalchemy as sa

from alembic import op

revision = "a84b67d71910"  # pragma: allowlist secret
down_revision = "9d1a65f35b28"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "digest_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "weekly_digests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("week_start", sa.Date(), nullable=False, unique=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("summary_json", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("weekly_digests")
    op.drop_table("digest_preferences")
