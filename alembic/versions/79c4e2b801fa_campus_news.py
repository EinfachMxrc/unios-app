# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep read-only campus news without portal session URLs.

Revision ID: 79c4e2b801fa
Revises: 60d49172efad
"""

import sqlalchemy as sa

from alembic import op

revision = "79c4e2b801fa"  # pragma: allowlist secret
down_revision = "60d49172efad"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campus_news",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_key", sa.String(200), nullable=False, unique=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("campus_news")
