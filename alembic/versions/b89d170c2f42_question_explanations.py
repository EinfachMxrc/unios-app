# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep proposed explanations separate from the user's original question.

Revision ID: b89d170c2f42
Revises: a742e10f8c31
"""

import sqlalchemy as sa

from alembic import op

revision = "b89d170c2f42"  # pragma: allowlist secret
down_revision = "a742e10f8c31"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_outbox_receipts", sa.Column("explanation_count", sa.Integer(),
                                                    nullable=False, server_default="0"))
    op.create_table(
        "question_explanation_queue",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("generated_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_question_explanation_queue_question_id", "question_explanation_queue", ["question_id"])


def downgrade() -> None:
    op.drop_index("ix_question_explanation_queue_question_id", table_name="question_explanation_queue")
    op.drop_table("question_explanation_queue")
    op.drop_column("ai_outbox_receipts", "explanation_count")
