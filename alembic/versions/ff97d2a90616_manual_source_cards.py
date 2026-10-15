# SPDX-License-Identifier: AGPL-3.0-or-later
"""Preserve explicit manual card identity and immutable source provenance."""

import sqlalchemy as sa

from alembic import op

revision = "ff97d2a90616"  # pragma: allowlist secret -- public schema ID
down_revision = "ff96c1980515"  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    # SQLite can add a nullable REFERENCES column without recreating the queue,
    # preserving incoming Anki-card foreign keys and all existing payload bytes.
    op.add_column("anki_card_queue", sa.Column("origin", sa.String(16),
                                              nullable=False, server_default="ai"))
    op.add_column("anki_card_queue", sa.Column("mutation_id", sa.String(36), nullable=True))
    op.add_column("anki_card_queue", sa.Column("source_snapshot", sa.JSON(), nullable=True))
    if op.get_bind().dialect.name == "sqlite":
        # Alembic cannot ALTER ADD CONSTRAINT on SQLite. The nullable column can
        # instead be declared with its reference in the original ADD COLUMN.
        op.execute("ALTER TABLE anki_card_queue ADD COLUMN source_version_id INTEGER "
                   "REFERENCES resource_versions(id)")
    else:
        op.add_column("anki_card_queue", sa.Column("source_version_id", sa.Integer(), nullable=True))
        op.create_foreign_key("fk_anki_card_queue_source_version_id", "anki_card_queue",
                              "resource_versions", ["source_version_id"], ["id"])
    op.create_index("ix_anki_card_queue_mutation_id", "anki_card_queue", ["mutation_id"], unique=True)


def downgrade():
    op.drop_index("ix_anki_card_queue_mutation_id", table_name="anki_card_queue")
    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint("fk_anki_card_queue_source_version_id", "anki_card_queue", type_="foreignkey")
    op.drop_column("anki_card_queue", "source_snapshot")
    op.drop_column("anki_card_queue", "source_version_id")
    op.drop_column("anki_card_queue", "mutation_id")
    op.drop_column("anki_card_queue", "origin")
