# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stage AI exercise proposals for review before they become practice tasks.

Revision ID: f6b57d5e0a12
Revises: d9a820f76c14
"""

import sqlalchemy as sa

from alembic import op

revision = "f6b57d5e0a12"  # pragma: allowlist secret
down_revision = "d9a820f76c14"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_outbox_receipts", sa.Column("exercise_count", sa.Integer(),
                                                    nullable=False, server_default="0"))
    op.create_table(
        "exercise_proposal_queue",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_exercise_proposal_queue_resource_id", "exercise_proposal_queue", ["resource_id"])


def downgrade() -> None:
    op.drop_index("ix_exercise_proposal_queue_resource_id", table_name="exercise_proposal_queue")
    op.drop_table("exercise_proposal_queue")
    op.drop_column("ai_outbox_receipts", "exercise_count")
