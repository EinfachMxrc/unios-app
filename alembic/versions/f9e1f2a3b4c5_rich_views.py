# SPDX-License-Identifier: AGPL-3.0-or-later

"""Add mixed, grouped and OR-filtered saved views.

Revision ID: f9e1f2a3b4c5
Revises: f9d0e1f2a3b4
"""

import sqlalchemy as sa

from alembic import op

revision = "f9e1f2a3b4c5"  # pragma: allowlist secret
down_revision = "f9d0e1f2a3b4"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("smart_collections") as batch:
        batch.add_column(sa.Column("group_by", sa.String(20), nullable=False, server_default="status"))
        batch.add_column(sa.Column("any_groups", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("smart_collections") as batch:
        batch.drop_column("any_groups")
        batch.drop_column("group_by")
