# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep the assignment target for activity entries.

Revision ID: 58a64007cbe1
Revises: 4c614cae3f02
"""

import sqlalchemy as sa

from alembic import op

revision = "58a64007cbe1"  # pragma: allowlist secret
down_revision = "4c614cae3f02"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("changes") as batch:
        batch.add_column(sa.Column("assignment_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_changes_assignment_id", "assignments", ["assignment_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("changes") as batch:
        batch.drop_constraint("fk_changes_assignment_id", type_="foreignkey")
        batch.drop_column("assignment_id")
