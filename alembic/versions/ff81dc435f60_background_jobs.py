# SPDX-License-Identifier: AGPL-3.0-or-later

"""Durable background job states, identifiers only."""
import sqlalchemy as sa

from alembic import op

revision = "ff81dc435f60"
down_revision = "ff70cb324e5f"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("background_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("completed", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("retry_of", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))

def downgrade():
    op.drop_table("background_jobs")
