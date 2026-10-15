# SPDX-License-Identifier: AGPL-3.0-or-later

"""Course permissions for many rows are read once, with the same answers as one-by-one checks."""

from sqlalchemy import event

from app.ai.access import allowed, course_access
from app.db.models import AiAccess


def test_course_access_answers_like_allowed_for_every_course(factory):
    with factory() as session:
        session.add_all([AiAccess(key="course:2", allowed=False), AiAccess(key="course:3", allowed=True),
                         AiAccess(key="category:mail", allowed=False)])
        session.commit()
        permitted = course_access(session)
        for course_id in (1, 2, 3, 4, None):
            assert permitted(course_id) == allowed(session, f"course:{course_id}")
        assert permitted(2) is False


def test_course_access_needs_one_query_however_many_rows_are_checked(factory):
    with factory() as session:
        session.add(AiAccess(key="course:7", allowed=False))
        session.commit()
        selects: list[str] = []

        def count(_conn, _cursor, statement, *_args):
            if statement.lstrip().upper().startswith("SELECT"):
                selects.append(statement)

        bind = session.get_bind()
        event.listen(bind, "before_cursor_execute", count)
        try:
            permitted = course_access(session)
            visible = [course_id for course_id in range(200) if permitted(course_id)]
        finally:
            event.remove(bind, "before_cursor_execute", count)
        assert len(selects) == 1
        assert len(visible) == 199
