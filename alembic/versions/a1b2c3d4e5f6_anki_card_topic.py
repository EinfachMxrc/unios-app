# SPDX-License-Identifier: AGPL-3.0-or-later

"""Link approved Anki card queue items to a shared learning topic.

Revision ID: a1b2c3d4e5f6
Revises: c1a472d90e6b
"""

import sqlalchemy as sa

from alembic import op

revision = "a1b2c3d4e5f6"  # pragma: allowlist secret
down_revision = "c1a472d90e6b"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("anki_card_queue") as batch:
        batch.add_column(sa.Column("topic_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_anki_card_queue_topic_id", "learning_topics", ["topic_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("anki_card_queue") as batch:
        batch.drop_constraint("fk_anki_card_queue_topic_id", type_="foreignkey")
        batch.drop_column("topic_id")
