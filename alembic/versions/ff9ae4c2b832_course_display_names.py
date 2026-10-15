# SPDX-License-Identifier: AGPL-3.0-or-later
"""Keep personal course labels separate from upstream identities."""

import sqlalchemy as sa

from alembic import op

revision = 'ff9ae4c2b832'  # pragma: allowlist secret -- public schema ID
down_revision = 'ff99e3b1a721'  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('courses', sa.Column('display_name', sa.String(length=80), nullable=True))


def downgrade():
    op.drop_column('courses', 'display_name')
