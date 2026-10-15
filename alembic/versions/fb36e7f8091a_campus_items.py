# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store events, news and documents read from the university portal.

Revision ID: fb36e7f8091a
Revises: fa25d6e7f809
"""

import sqlalchemy as sa

from alembic import op

revision = "fb36e7f8091a"  # pragma: allowlist secret
down_revision = "fa25d6e7f809"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campus_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_key", sa.String(64), nullable=False, unique=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("category", sa.String(300), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("file_label", sa.String(60)),
        sa.Column("study_program", sa.String(300)),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campus_items_kind", "campus_items", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_campus_items_kind", table_name="campus_items")
    op.drop_table("campus_items")
