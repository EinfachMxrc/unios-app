# SPDX-License-Identifier: AGPL-3.0-or-later

"""Version-aware local undo and an in-app notification state."""
import sqlalchemy as sa

from alembic import op

revision = "ff70cb324e5f"
down_revision = "fe69ba213d4e"
branch_labels = depends_on = None


def upgrade():
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(timezone=True)))
    op.add_column("notifications", sa.Column("muted", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("notifications") as batch:
        batch.add_column(sa.Column("course_id", sa.Integer()))
        batch.create_foreign_key("fk_notification_course", "courses", ["course_id"], ["id"])
        batch.create_index("ix_notifications_course_id", ["course_id"])
    op.create_table("notification_mutes", sa.Column("scope", sa.String(80), primary_key=True),
                    sa.Column("enabled", sa.Boolean(), nullable=False))
    op.create_table("local_actions", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("kind", sa.String(30), nullable=False, index=True),
                    sa.Column("entity_id", sa.String(350), nullable=False),
                    sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), index=True),
                    sa.Column("before", sa.JSON(), nullable=False),
                    sa.Column("expected_revision", sa.Integer(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("undone_at", sa.DateTime(timezone=True)))


def downgrade():
    op.drop_table("local_actions")
    op.drop_table("notification_mutes")
    with op.batch_alter_table("notifications") as batch:
        batch.drop_index("ix_notifications_course_id")
        batch.drop_constraint("fk_notification_course", type_="foreignkey")
        batch.drop_column("course_id")
        batch.drop_column("muted")
        batch.drop_column("read_at")
