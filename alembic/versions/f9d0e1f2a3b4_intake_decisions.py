# SPDX-License-Identifier: AGPL-3.0-or-later

"""Track triage decisions separately from immutable incoming content.

Revision ID: f9d0e1f2a3b4
Revises: f8c9d0e1f2a3
"""

import sqlalchemy as sa

from alembic import op

revision = "f9d0e1f2a3b4"  # pragma: allowlist secret
down_revision = "f8c9d0e1f2a3"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intake_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_kind", sa.String(30), nullable=False),
        sa.Column("source_id", sa.String(300), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id")),
        sa.Column("target_kind", sa.String(30)),
        sa.Column("target_id", sa.String(80)),
        sa.Column("duplicate_of", sa.String(350)),
        sa.Column("snoozed_until", sa.DateTime(timezone=True)),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source_kind", "source_id"),
    )
    op.create_index("ix_intake_decisions_source_kind", "intake_decisions", ["source_kind"])
    op.create_index("ix_intake_decisions_state", "intake_decisions", ["state"])


def downgrade() -> None:
    op.drop_index("ix_intake_decisions_state", "intake_decisions")
    op.drop_index("ix_intake_decisions_source_kind", "intake_decisions")
    op.drop_table("intake_decisions")
