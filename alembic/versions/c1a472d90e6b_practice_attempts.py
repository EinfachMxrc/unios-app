# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep approved exercise provenance and complete attempt snapshots.

Revision ID: c1a472d90e6b
Revises: f8a726d31b04
"""

import sqlalchemy as sa

from alembic import op

revision = "c1a472d90e6b"  # pragma: allowlist secret
down_revision = "f8a726d31b04"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("exercises") as batch:
        batch.add_column(sa.Column("proposal_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("difficulty", sa.String(20), nullable=True))
        batch.add_column(sa.Column("solution_steps", sa.Text(), nullable=True))
        batch.create_foreign_key("fk_exercises_proposal_id", "exercise_proposal_queue", ["proposal_id"], ["id"])
        batch.create_unique_constraint("uq_exercises_proposal_id", ["proposal_id"])
    with op.batch_alter_table("exercise_attempts") as batch:
        batch.add_column(sa.Column("topic_name", sa.String(300), nullable=True))
        batch.add_column(sa.Column("difficulty", sa.String(20), nullable=True))
        batch.add_column(sa.Column("solution_steps", sa.Text(), nullable=True))
        batch.add_column(sa.Column("duration_seconds", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("exercise_attempts") as batch:
        batch.drop_column("duration_seconds")
        batch.drop_column("solution_steps")
        batch.drop_column("difficulty")
        batch.drop_column("topic_name")
    with op.batch_alter_table("exercises") as batch:
        batch.drop_constraint("uq_exercises_proposal_id", type_="unique")
        batch.drop_constraint("fk_exercises_proposal_id", type_="foreignkey")
        batch.drop_column("solution_steps")
        batch.drop_column("difficulty")
        batch.drop_column("proposal_id")
