# SPDX-License-Identifier: AGPL-3.0-or-later

from app.search.query import parse
from app.search.repository import structured


def search_structured(session, value, course_id=None, semester_id=None):
    return structured(session, parse(value), course_id, semester_id)
