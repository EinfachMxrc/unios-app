# SPDX-License-Identifier: AGPL-3.0-or-later

"""Record immutable Git mirror snapshots for projects.

Revision ID: 1dca4e0b9f35
Revises: c0f534ab2e17
"""

import sqlalchemy as sa

from alembic import op

revision = "1dca4e0b9f35"  # pragma: allowlist secret
down_revision = "c0f534ab2e17"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "repo_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("repository", sa.String(200), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("manifest_path", sa.Text(), nullable=False, unique=True),
        sa.Column("manifest_sha256", sa.String(64), nullable=False),
        sa.Column("refs_count", sa.Integer(), nullable=False),
        sa.Column("head", sa.String(64)),
    )
    op.create_index("ix_repo_snapshots_project_id", "repo_snapshots", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_repo_snapshots_project_id", table_name="repo_snapshots")
    op.drop_table("repo_snapshots")
