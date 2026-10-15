# SPDX-License-Identifier: AGPL-3.0-or-later
"""Durable, atomically claimed provider budgets."""
import sqlalchemy as sa

from alembic import op

revision = 'ff95b0879404'  # pragma: allowlist secret -- public schema ID
down_revision = 'ff94af768293'  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('ai_budget_reservations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('month', sa.String(7), nullable=False),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('tokens', sa.Integer(), nullable=False),
        sa.Column('state', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_ai_budget_reservations_month', 'ai_budget_reservations', ['month'])


def downgrade():
    op.drop_index('ix_ai_budget_reservations_month', table_name='ai_budget_reservations')
    op.drop_table('ai_budget_reservations')
