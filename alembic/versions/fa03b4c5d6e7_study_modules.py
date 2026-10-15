# SPDX-License-Identifier: AGPL-3.0-or-later

"""Group existing learning topics into course study modules.

Revision ID: fa03b4c5d6e7
Revises: f9f2a3b4c5d6
"""

import sqlalchemy as sa

from alembic import op

revision = "fa03b4c5d6e7"  # pragma: allowlist secret
down_revision = "f9f2a3b4c5d6"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("study_modules",
                    sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
                    sa.Column("name", sa.String(120), nullable=False),
                    sa.Column("revision", sa.Integer(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_study_modules_course_id", "study_modules", ["course_id"])
    with op.batch_alter_table("learning_topics") as batch:
        batch.add_column(sa.Column("module_id", sa.Integer(),
                                   sa.ForeignKey("study_modules.id", name="fk_learning_topics_module_id")))
        batch.create_index("ix_learning_topics_module_id", ["module_id"])


def downgrade() -> None:
    with op.batch_alter_table("learning_topics") as batch:
        batch.drop_index("ix_learning_topics_module_id")
        batch.drop_column("module_id")
    op.drop_index("ix_study_modules_course_id", table_name="study_modules")
    op.drop_table("study_modules")
