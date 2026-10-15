# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store server-side AI course and category permissions.

Revision ID: b12c4e670a21
Revises: a84b67d71910
"""

import sqlalchemy as sa

from alembic import op

revision = "b12c4e670a21"  # pragma: allowlist secret
down_revision = "a84b67d71910"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_access",
        sa.Column("key", sa.String(120), primary_key=True),
        sa.Column("allowed", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_access")
