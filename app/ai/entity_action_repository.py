# SPDX-License-Identifier: AGPL-3.0-or-later
"""Load the action target and explicit grants without deciding MCP policy."""

from app.ai.access import allowed
from app.entities.repository import get


def action_target(session, kind, object_id):
    entity = get(session, kind, object_id)
    course_id = entity.id if kind == "course" and entity is not None else getattr(entity, "course_id", None)
    category = "submission_status" if kind == "assignment" else "course_material"
    grants = {"course": course_id is not None and allowed(session, f"course:{course_id}"),
              "category": allowed(session, f"category:{category}"),
              "tutor": allowed(session, "category:coding_tutor"),
              "notes": allowed(session, "category:notes"),
              "course_material": allowed(session, "category:course_material")}
    return entity, course_id, grants
