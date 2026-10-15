# SPDX-License-Identifier: AGPL-3.0-or-later
"""Notes and quick captures can sit in a trash before they are erased."""

import sqlalchemy as sa

from alembic import op

revision = "ff99e3b1a721"  # pragma: allowlist secret -- public schema ID
down_revision = "ff98c7da0320"  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    for table in ("notes", "jots"):
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])


def downgrade():
    for table in ("notes", "jots"):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_at")
