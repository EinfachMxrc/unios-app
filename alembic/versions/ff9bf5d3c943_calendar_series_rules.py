# SPDX-License-Identifier: AGPL-3.0-or-later
"""Preserve personal weekly-series rules across timetable refreshes."""
import sqlalchemy as sa

from alembic import op

revision = 'ff9bf5d3c943'  # pragma: allowlist secret -- public schema ID
down_revision = 'ff9ae4c2b832'  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('calendar_series_rules', sa.Column('id', sa.Integer(), primary_key=True),
                    sa.Column('source', sa.String(40), nullable=False),
                    sa.Column('slot_id', sa.String(64), nullable=False),
                    sa.Column('from_day', sa.Date(), nullable=True),
                    sa.Column('payload', sa.JSON(), nullable=False),
                    sa.Column('active', sa.Boolean(), nullable=False))
    op.create_index('ix_calendar_series_rules_source', 'calendar_series_rules', ['source'])
    op.create_index('ix_calendar_series_rules_slot_id', 'calendar_series_rules', ['slot_id'])


def downgrade():
    op.drop_table('calendar_series_rules')
