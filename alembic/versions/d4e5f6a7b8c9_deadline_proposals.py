# SPDX-License-Identifier: AGPL-3.0-or-later

"""Review dates extracted from study documents before changing the calendar.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

import sqlalchemy as sa

from alembic import op

revision = "d4e5f6a7b8c9"  # pragma: allowlist secret
down_revision = "c3d4e5f6a7b8"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deadline_proposals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id"), nullable=False),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("resource_versions.id"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("quote", sa.String(300), nullable=False),
        sa.Column("candidate_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("version_id", name="uq_deadline_proposal_version"),
    )


def downgrade() -> None:
    op.drop_table("deadline_proposals")
