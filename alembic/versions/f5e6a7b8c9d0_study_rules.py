# SPDX-License-Identifier: AGPL-3.0-or-later

"""Save local study rules and their idempotent action log.

Revision ID: f5e6a7b8c9d0
Revises: f4d5e6a7b8c9
"""

import sqlalchemy as sa

from alembic import op

revision = "f5e6a7b8c9d0"  # pragma: allowlist secret
down_revision = "f4d5e6a7b8c9"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("trigger", sa.String(30), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id")),
        sa.Column("days", sa.Integer()),
        sa.Column("max_percent", sa.Integer()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "rule_executions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("study_rules.id"), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("object_type", sa.String(30), nullable=False),
        sa.Column("object_id", sa.String(80), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("undone_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("rule_id", "generation", "object_type", "object_id"),
    )
    op.create_index("ix_rule_executions_rule_id", "rule_executions", ["rule_id"])


def downgrade() -> None:
    op.drop_index("ix_rule_executions_rule_id", table_name="rule_executions")
    op.drop_table("rule_executions")
    op.drop_table("study_rules")
