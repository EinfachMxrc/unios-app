# SPDX-License-Identifier: AGPL-3.0-or-later
"""Avoid re-reading and re-chunking unchanged historical versions."""
from alembic import op
from app.corpus.incremental_schema import install, uninstall

revision = 'ff96c1980515'  # pragma: allowlist secret -- public schema ID
down_revision = 'ff95b0879404'  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    install(op.get_bind())


def downgrade():
    uninstall(op.get_bind())
