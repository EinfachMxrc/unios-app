# SPDX-License-Identifier: AGPL-3.0-or-later

"""Record a material version's first reader opening for honest study analytics.

Revision ID: fa14c5d6e7f8
Revises: fa03b4c5d6e7
"""

import sqlalchemy as sa

from alembic import op

revision = "fa14c5d6e7f8"  # pragma: allowlist secret
down_revision = "fa03b4c5d6e7"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("resource_versions") as batch:
        batch.add_column(sa.Column("first_opened_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    with op.batch_alter_table("resource_versions") as batch:
        batch.drop_column("first_opened_at")
