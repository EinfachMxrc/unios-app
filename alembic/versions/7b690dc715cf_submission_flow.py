# SPDX-License-Identifier: AGPL-3.0-or-later

"""Track explicit Moodle submission attempts and disabled-by-default control.

Revision ID: 7b690dc715cf
Revises: 1dca4e0b9f35
"""

import sqlalchemy as sa

from alembic import op

revision = "7b690dc715cf"  # pragma: allowlist secret
down_revision = "1dca4e0b9f35"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "submission_controls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "submission_attempts",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("assignments.id"), nullable=False),
        sa.Column("state", sa.String(30), nullable=False),
        sa.Column("files", sa.JSON(), nullable=False),
        sa.Column("existing_status", sa.String(30), nullable=False),
        sa.Column("existing_revision", sa.String(100), nullable=False),
        sa.Column("final_submit", sa.Boolean(), nullable=False),
        sa.Column("requires_final_submit", sa.Boolean(), nullable=False),
        sa.Column("statement_required", sa.Boolean(), nullable=False),
        sa.Column("statement_text", sa.Text()),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("cutoff_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("result_status", sa.String(30)),
        sa.Column("warning", sa.Text()),
    )
    op.create_index("ix_submission_attempts_assignment_id", "submission_attempts", ["assignment_id"])


def downgrade() -> None:
    op.drop_index("ix_submission_attempts_assignment_id", table_name="submission_attempts")
    op.drop_table("submission_attempts")
    op.drop_table("submission_controls")
