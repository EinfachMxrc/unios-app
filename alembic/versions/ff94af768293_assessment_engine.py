# SPDX-License-Identifier: AGPL-3.0-or-later
"""Typed assessments, immutable answers, tutor proposals and exam sessions."""
import sqlalchemy as sa

from alembic import op
from app.assessment.index_schema import install, uninstall

revision = 'ff94af768293'  # pragma: allowlist secret -- public schema ID
down_revision = 'ff93fe657182'  # pragma: allowlist secret -- public schema ID
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('assessment_tasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=False),
        sa.Column('topic_id', sa.Integer(), sa.ForeignKey('learning_topics.id')),
        sa.Column('title', sa.String(160), nullable=False), sa.Column('type', sa.String(40), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False), sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('provenance', sa.JSON(), nullable=False), sa.Column('status', sa.String(16), nullable=False),
        sa.Column('highest_hint', sa.Integer(), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_assessment_tasks_course_id', 'assessment_tasks', ['course_id'])
    op.create_table('assessment_sessions', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('task_ids', sa.JSON(), nullable=False), sa.Column('state', sa.String(16), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False), sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False))
    op.create_table('assessment_attempts', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(160), nullable=False),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('assessment_tasks.id'), nullable=False),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=False),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('assessment_sessions.id')),
        sa.Column('answer', sa.JSON(), nullable=False), sa.Column('report', sa.JSON(), nullable=False),
        sa.Column('hint_level', sa.Integer(), nullable=False), sa.Column('feedback_requested', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    for column in ('task_id', 'course_id', 'session_id'):
        op.create_index('ix_assessment_attempts_' + column, 'assessment_attempts', [column])
    op.create_table('assessment_reviews', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('assessment_attempts.id'), nullable=False),
        sa.Column('feedback', sa.JSON(), nullable=False), sa.Column('status', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_assessment_reviews_attempt_id', 'assessment_reviews', ['attempt_id'])
    op.create_table('assessment_requests', sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id'), nullable=False),
        sa.Column('source', sa.JSON(), nullable=False), sa.Column('source_hash', sa.String(64), nullable=False),
        sa.Column('status', sa.String(16), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_assessment_requests_course_id', 'assessment_requests', ['course_id'])
    install(op.get_bind())


def downgrade():
    uninstall(op.get_bind())
    for name in ('assessment_requests', 'assessment_reviews', 'assessment_attempts', 'assessment_sessions', 'assessment_tasks'):
        op.drop_table(name)
