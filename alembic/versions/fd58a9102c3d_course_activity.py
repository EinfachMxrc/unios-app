# SPDX-License-Identifier: AGPL-3.0-or-later
"""Keep course activity independent of enrollment and downloaded materials."""
import sqlalchemy as sa

from alembic import op

revision = "fd58a9102c3d"
down_revision = "fc47f8091b2c"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("courses", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"))


def downgrade():
    op.drop_column("courses", "is_active")
