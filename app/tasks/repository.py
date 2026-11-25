# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read and write personal tasks. Business rules live in the service."""

from sqlalchemy import select, update

from app.db.models import Course, Task
from app.db.trash import INCLUDE_TRASHED


class TaskRepository:
    def __init__(self, factory):
        self.factory = factory

    def listing(self, done_limit: int) -> list[tuple[Task, str | None]]:
        base = select(Task, Course.name).outerjoin(Course, Course.id == Task.course_id)
        with self.factory() as session:
            unfinished = session.execute(base.where(Task.status != "done")
                                         .order_by(Task.due_on.is_(None), Task.due_on, Task.created_at)).all()
            done = session.execute(base.where(Task.status == "done")
                                   .order_by(Task.completed_at.desc()).limit(done_limit)).all()
            return [(row[0], row[1]) for row in [*unfinished, *done]]

    def find(self, task_id: str) -> tuple[Task, str | None] | None:
        """Also finds a trashed task, so a repeated create cannot collide with it."""
        with self.factory() as session:
            row = session.execute(select(Task, Course.name).outerjoin(Course, Course.id == Task.course_id)
                                  .where(Task.id == task_id).execution_options(**INCLUDE_TRASHED)).first()
            return None if row is None else (row[0], row[1])

    def course_exists(self, course_id: int) -> bool:
        with self.factory() as session:
            return session.get(Course, course_id) is not None

    def add(self, task: Task) -> None:
        with self.factory() as session:
            session.add(task)
            session.commit()

    def update(self, task_id: str, expected_revision: int, values: dict) -> bool:
        """Compare-and-swap on the revision; False means someone else saved first."""
        with self.factory() as session:
            changed = session.scalar(update(Task)
                                     .where(Task.id == task_id, Task.revision == expected_revision,
                                            Task.deleted_at.is_(None))
                                     .values(**values, revision=expected_revision + 1)
                                     .returning(Task.id))
            session.commit()
            return changed is not None
