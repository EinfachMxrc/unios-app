# SPDX-License-Identifier: AGPL-3.0-or-later

"""Remember which scanned pages were tried by local OCR.

Revision ID: fa25d6e7f809
Revises: fa14c5d6e7f8
"""

import sqlalchemy as sa

from alembic import op

revision = "fa25d6e7f809"  # pragma: allowlist secret
down_revision = "fa14c5d6e7f8"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("resource_texts", sa.Column("ocr_attempted_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("resource_texts", "ocr_attempted_at")
