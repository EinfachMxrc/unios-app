# SPDX-License-Identifier: AGPL-3.0-or-later
"""Add replay identity without recreating or rekeying historical reviews."""

import sqlalchemy as sa

from alembic import op

revision = "ff98c7da0320"  # pragma: allowlist secret -- public schema ID
down_revision = "ff97d2a90616"  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("anki_reviews", sa.Column("review_id", sa.String(100), nullable=True))
    op.create_index("ix_anki_reviews_review_id", "anki_reviews", ["review_id"], unique=True)


def downgrade():
    op.drop_index("ix_anki_reviews_review_id", table_name="anki_reviews")
    op.drop_column("anki_reviews", "review_id")
