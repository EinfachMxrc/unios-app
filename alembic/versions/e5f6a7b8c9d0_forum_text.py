# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep plain forum text when Moodle provides it for local search.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

import sqlalchemy as sa

from alembic import op

revision = "e5f6a7b8c9d0"  # pragma: allowlist secret
down_revision = "d4e5f6a7b8c9"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("announcements", sa.Column("body", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("announcements", "body")
