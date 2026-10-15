# SPDX-License-Identifier: AGPL-3.0-or-later
"""Shared MCP action policy; each HTTP entry point owns one auth/audit event."""

from fastapi import HTTPException

from app.ai.entity_action_repository import action_target


class McpEntityActionService:
    def __init__(self, factory, actions):
        self.factory, self.actions = factory, actions

    def run(self, kind, object_id, action_id, payload, actor, scopes):
        with self.factory() as session:
            entity, _course_id, grants = action_target(session, kind, object_id)
            permitted = entity is not None and grants.get("course", False)
            if kind in {"assignment", "resource"}:
                permitted = permitted and grants.get("category", False)
                if kind == "resource" and entity is not None and entity.group_category == "other_group":
                    permitted = False
            elif kind in {"course", "coding_task", "coding_attempt", "assessment_task", "assessment_attempt"}:
                permitted = permitted and action_id.startswith(("coding.", "assessment.")) and grants.get("tutor", False)
            else:
                permitted = False
            if not permitted:
                raise HTTPException(403, "Objekt oder Kategorie ist für KI gesperrt")
            if actor.startswith("oauth:") and action_id.startswith(("coding.", "assessment.")):
                required = "coding:propose" if action_id in {
                    "coding.create_practice", "coding.next_practice", "coding.submit_review",
                    "assessment.create", "assessment.submit_review",
                } else "actions:read"
                if required not in scopes:
                    raise HTTPException(403, "OAuth-Berechtigung fehlt: " + required)
            if action_id == "assessment.source_context":
                source = "notes" if payload.input.get("note_id") else "course_material"
                if not grants.get(source, False):
                    raise HTTPException(403, "Quelle ist für KI gesperrt")
        return self.actions.dispatch(kind, object_id, action_id, payload, mcp=True)
