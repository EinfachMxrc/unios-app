# SPDX-License-Identifier: AGPL-3.0-or-later

"""Index foreign key and filter columns SQLite never indexes on its own.

Revision ID: f2b3c4d5e6a7
Revises: f3c4d5e6a7b8
"""

from alembic import op

revision = "f2b3c4d5e6a7"  # pragma: allowlist secret
down_revision = "f3c4d5e6a7b8"  # pragma: allowlist secret
branch_labels = None
depends_on = None

# (index name, table, column). ``resource_versions.resource_id`` is not listed:
# its existing UniqueConstraint("resource_id", "version") already indexes it
# as the constraint's leading column.
_INDEXES = [
    ("ix_changes_created_at", "changes", "created_at"),
    ("ix_changes_course_id", "changes", "course_id"),
    ("ix_changes_kind", "changes", "kind"),
    ("ix_resources_course_id", "resources", "course_id"),
    ("ix_assignments_course_id", "assignments", "course_id"),
    ("ix_announcements_course_id", "announcements", "course_id"),
    ("ix_course_sections_course_id", "course_sections", "course_id"),
    ("ix_exercise_attempts_exercise_id", "exercise_attempts", "exercise_id"),
    ("ix_anki_cards_queue_id", "anki_cards", "queue_id"),
    ("ix_anki_reviews_card_id", "anki_reviews", "card_id"),
]


def upgrade() -> None:
    for name, table, column in _INDEXES:
        op.create_index(name, table, [column])


def downgrade() -> None:
    for name, table, _column in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
