# SPDX-License-Identifier: AGPL-3.0-or-later
"""Portal document collections are stored with courses, but are not teaching courses."""
from app.db.models import Course

DOCUMENT_SOURCES = ("mycampus", "primuss_portal")


def teaching_courses():
    return Course.source.not_in(DOCUMENT_SOURCES)
