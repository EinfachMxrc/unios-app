# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store annotations separately from immutable teaching material.

Revision ID: 6f4c0aa2d2bf
Revises: ea20cf67d518
"""

import sqlalchemy as sa

from alembic import op

revision = "6f4c0aa2d2bf"  # pragma: allowlist secret
down_revision = "ea20cf67d518"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "material_annotations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id"), nullable=False),
        sa.Column("source_version_id", sa.Integer(), sa.ForeignKey("resource_versions.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("context_before", sa.Text(), nullable=False),
        sa.Column("context_after", sa.Text(), nullable=False),
        sa.Column("source_page", sa.Integer(), nullable=False),
        sa.Column("source_rects_json", sa.Text(), nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_material_annotations_resource_id", "material_annotations", ["resource_id"])
    op.create_table(
        "course_scratchpads",
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), primary_key=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("course_scratchpads")
    op.drop_index("ix_material_annotations_resource_id", table_name="material_annotations")
    op.drop_table("material_annotations")
