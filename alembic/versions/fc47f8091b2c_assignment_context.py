# SPDX-License-Identifier: AGPL-3.0-or-later
"""Keep assignment descriptions and confirmed text deadlines."""
import sqlalchemy as sa

from alembic import op

revision = "fc47f8091b2c"
down_revision = "fb36e7f8091a"
branch_labels = None
depends_on = None


def upgrade():
    for name, kind, default in (
        ("description", sa.Text(), ""), ("due_note", sa.Text(), ""),
        ("delivery", sa.String(20), "unknown"), ("due_origin", sa.String(20), "unknown"),
        ("due_override", sa.Boolean(), "0"),
    ):
        op.add_column("assignments", sa.Column(name, kind, nullable=False, server_default=default))


def downgrade():
    for name in ("due_override", "due_origin", "delivery", "due_note", "description"):
        op.drop_column("assignments", name)
