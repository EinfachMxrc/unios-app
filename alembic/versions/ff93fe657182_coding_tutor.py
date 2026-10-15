# SPDX-License-Identifier: AGPL-3.0-or-later
"""Coding tasks, immutable drafts/attempts and review proposals."""
import sqlalchemy as sa

from alembic import op
from app.coding.index_schema import install, uninstall

revision = 'ff93fe657182'  # pragma: allowlist secret -- public Alembic identifier
down_revision = 'ff92ed546071'  # pragma: allowlist secret -- public Alembic identifier
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('coding_tasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=False),
        sa.Column('topic_id', sa.Integer(), sa.ForeignKey('learning_topics.id')),
        sa.Column('title', sa.String(160), nullable=False),
        sa.Column('template', sa.String(40), nullable=False),
        sa.Column('template_version', sa.String(40), nullable=False),
        sa.Column('language', sa.String(16), nullable=False),
        sa.Column('difficulty', sa.String(16), nullable=False),
        sa.Column('story', sa.Text(), nullable=False),
        sa.Column('learning_goal', sa.String(300), nullable=False),
        sa.Column('rubric', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('highest_hint', sa.Integer(), nullable=False),
        sa.Column('draft_revision', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_coding_tasks_course_id', 'coding_tasks', ['course_id'])
    op.create_table('coding_drafts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('coding_tasks.id'), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('files', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('task_id', 'revision'))
    op.create_index('ix_coding_drafts_task_id', 'coding_drafts', ['task_id'])
    op.create_table('coding_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('coding_tasks.id'), nullable=False),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=False),
        sa.Column('title', sa.String(160), nullable=False),
        sa.Column('files', sa.JSON(), nullable=False),
        sa.Column('hint_level', sa.Integer(), nullable=False),
        sa.Column('state', sa.String(16), nullable=False),
        sa.Column('report', sa.JSON(), nullable=False),
        sa.Column('feedback_requested', sa.Boolean(), nullable=False),
        sa.Column('feedback_level', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_coding_attempts_task_id', 'coding_attempts', ['task_id'])
    op.create_index('ix_coding_attempts_course_id', 'coding_attempts', ['course_id'])
    op.create_table('coding_reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('coding_attempts.id'), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('feedback', sa.Text(), nullable=False),
        sa.Column('file', sa.String(80)),
        sa.Column('line', sa.Integer()),
        sa.Column('next_template', sa.String(40)),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_coding_reviews_attempt_id', 'coding_reviews', ['attempt_id'])
    install(op.get_bind())


def downgrade():
    uninstall(op.get_bind())
    for name in ('coding_reviews', 'coding_attempts', 'coding_drafts', 'coding_tasks'):
        op.drop_table(name)
