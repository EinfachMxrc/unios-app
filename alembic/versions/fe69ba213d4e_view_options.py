# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persist unified view display and source filters without changing old views."""
import sqlalchemy as sa

from alembic import op

revision = "fe69ba213d4e"
down_revision = "fd58a9102c3d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("smart_collections", sa.Column("options", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("smart_collections", "options")
