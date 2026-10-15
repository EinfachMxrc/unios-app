# SPDX-License-Identifier: AGPL-3.0-or-later
"""Versioned, rebuildable agent corpus with transactionally queued invalidation."""
from alembic import op
from app.corpus.schema_v1 import install, uninstall

revision = 'ff92ed546071'  # pragma: allowlist secret -- public Alembic revision identifier
down_revision = 'ff81dc435f60'  # pragma: allowlist secret -- public Alembic revision identifier
branch_labels = None
depends_on = None


def upgrade():
    install(op.get_bind())


def downgrade():
    uninstall(op.get_bind())
