# SPDX-License-Identifier: AGPL-3.0-or-later
"""Keep personal tasks beside the assignments read from the university."""
import sqlalchemy as sa

from alembic import op

revision = 'ffa1b7c3d9e4'  # pragma: allowlist secret -- public schema ID
down_revision = 'ff9bf5d3c943'  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('tasks', sa.Column('id', sa.String(36), primary_key=True),
                    sa.Column('title', sa.String(300), nullable=False),
                    sa.Column('notes', sa.Text(), nullable=False),
                    sa.Column('status', sa.String(10), nullable=False),
                    sa.Column('due_on', sa.Date(), nullable=True),
                    sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=True),
                    sa.Column('revision', sa.Integer(), nullable=False),
                    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
                    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
                    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
                    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_tasks_status', 'tasks', ['status'])
    op.create_index('ix_tasks_course_id', 'tasks', ['course_id'])
    op.create_index('ix_tasks_deleted_at', 'tasks', ['deleted_at'])


def downgrade():
    op.drop_table('tasks')
