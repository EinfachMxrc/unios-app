# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep local course projects and their Moodle assignment links.

Revision ID: c0f534ab2e17
Revises: b89d170c2f42
"""

import sqlalchemy as sa

from alembic import op

revision = "c0f534ab2e17"  # pragma: allowlist secret
down_revision = "b89d170c2f42"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("members", sa.JSON(), nullable=False),
        sa.Column("links", sa.JSON(), nullable=False),
        sa.Column("todos", sa.JSON(), nullable=False),
        sa.Column("github_repo", sa.String(200)),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_projects_course_id", "projects", ["course_id"])
    op.create_table(
        "project_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("assignments.id"), nullable=False),
        sa.UniqueConstraint("project_id", "assignment_id"),
    )
    op.create_index("ix_project_assignments_project_id", "project_assignments", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_assignments_project_id", table_name="project_assignments")
    op.drop_table("project_assignments")
    op.drop_index("ix_projects_course_id", table_name="projects")
    op.drop_table("projects")
