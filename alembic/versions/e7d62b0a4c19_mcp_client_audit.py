# SPDX-License-Identifier: AGPL-3.0-or-later

"""Record the authorized OAuth client on MCP tool accesses.

Revision ID: e7d62b0a4c19
Revises: a583f6e2b941
"""

import sqlalchemy as sa

from alembic import op

revision = "e7d62b0a4c19"  # pragma: allowlist secret
down_revision = "a583f6e2b941"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ai_tool_access") as batch:
        batch.add_column(sa.Column("actor", sa.String(128), nullable=False,
                                   server_default="local"))


def downgrade() -> None:
    with op.batch_alter_table("ai_tool_access") as batch:
        batch.drop_column("actor")
