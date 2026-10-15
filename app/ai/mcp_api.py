# SPDX-License-Identifier: AGPL-3.0-or-later

"""Narrow host API for the optional local MCP process."""

import ipaddress
import re
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest, new
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.ai.access import allowed, course_access
from app.ai.context import mail_context, timetable_context
from app.ai.entity_action_service import McpEntityActionService
from app.ai.exercises import ExerciseImport, enqueue_exercises
from app.anki.api import CardImport, enqueue_cards
from app.config import Settings
from app.db.models import (
    AiAccess,
    AiToolAccess,
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Assignment,
    Change,
    Course,
    Deadline,
    Exam,
    ExamRegistration,
    LearningTopic,
    Project,
    RepoSnapshot,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.entities.actions import ActionRequest, EntityActions
from app.entities.schema import EntityKind, catalog
from app.host.lease import HostCoordinator
from app.projects.repo_content import RepositorySearchError, search_snapshot
from app.security import is_dashboard_request
from app.submissions.service import latest_check


class McpStateChange(BaseModel):
    enabled: bool


mcp_actor: ContextVar[str] = ContextVar("mcp_actor", default="local")
mcp_scopes: ContextVar[frozenset[str]] = ContextVar('mcp_scopes', default=frozenset())


def _is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


def verified_mcp_actor(client_id: str, signature: str, secret: str, client_host: str | None,
                       scopes: str | None = None) -> str | None:
    if not client_id and not signature:
        # No client-signature headers at all: only a genuine loopback caller
        # (the local MCP process) may be labelled "local" in the audit log.
        return "local" if _is_loopback_host(client_host) else "unknown"
    if not re.fullmatch(r"[A-Za-z0-9._~-]{1,100}", client_id) or not secret:
        return None
    message = f'mcp-client:{client_id}' + (f':scopes:{scopes}' if scopes is not None else '')
    expected = new(secret.encode(), message.encode(), sha256).hexdigest()
    if not compare_digest(signature, expected):
        return None
    return f"oauth:{client_id}"


def _authorized_reader(request: Request, settings: Settings, token: str) -> bool:
    """Allow the dashboard to read MCP state/audit without a token, else require one."""
    if settings.mcp_token and compare_digest(token, settings.mcp_token):
        return True
    return is_dashboard_request(request)


def mcp_router(settings: Settings, factory, coordinator: HostCoordinator, actions: EntityActions, cache=None) -> APIRouter:
    router = APIRouter(prefix="/api/ai/mcp")
    action_service = McpEntityActionService(factory, actions)

    def dispatch_action(kind, object_id, action_id, payload, _token):
        return action_service.run(kind, object_id, action_id, payload, mcp_actor.get(), mcp_scopes.get())

    def audit(session, tool: str, resource_id: int | None, permitted: bool) -> None:
        session.add(AiToolAccess(tool=tool, resource_id=resource_id, permitted=permitted,
                                 actor=mcp_actor.get()))
        session.commit()

    def authorize(session, token: str, tool: str, resource_id: int | None = None) -> None:
        state = session.get(AiAccess, "mcp:enabled")
        if not settings.mcp_enabled or not settings.mcp_token or (state is not None and not state.allowed):
            raise HTTPException(503, "Lokale KI-Verbindung ist ausgeschaltet")
        if not coordinator.is_writer:
            raise HTTPException(423, "Hauptgerät ist nicht verfügbar")
        if not compare_digest(token, settings.mcp_token):
            audit(session, tool, resource_id, False)
            raise HTTPException(403, "KI-Verbindung nicht autorisiert")

    @router.get("/schema")
    def get_public_schema(x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_entity_schema")
            audit(session, "get_entity_schema", None, True)
            return catalog()

    @router.get('/ping')
    def ping(x_unios_mcp_token: str = Header(default='')):
        with factory() as session:
            authorize(session, x_unios_mcp_token, 'ping')
        return {'enabled': True}

    @router.post("/entities/{kind}/{object_id}/actions/{action_id}")
    def run_entity_action(kind: EntityKind, object_id: str, action_id: str, payload: ActionRequest,
                          x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "run_entity_action")
            try:
                result = dispatch_action(kind, object_id, action_id, payload, x_unios_mcp_token)
            except HTTPException:
                audit(session, "run_entity_action", None, False)
                raise
            audit(session, "run_entity_action", None, True)
            return result

    def _state_payload(session) -> dict:
        state = session.get(AiAccess, "mcp:enabled")
        return {"configured": bool(settings.mcp_enabled and settings.mcp_token),
                "enabled": bool(settings.mcp_enabled and settings.mcp_token
                                and (state is None or state.allowed))}

    @router.get("/state")
    def mcp_state(request: Request, x_unios_mcp_token: str = Header(default="")):
        if not _authorized_reader(request, settings, x_unios_mcp_token):
            raise HTTPException(403, "Status nur mit KI-Token oder vom Dashboard sichtbar")
        with factory() as session:
            return _state_payload(session)

    @router.put("/state")
    def change_mcp_state(payload: McpStateChange):
        coordinator.assert_writer()
        with factory() as session:
            state = session.get(AiAccess, "mcp:enabled")
            if state is None:
                session.add(AiAccess(key="mcp:enabled", allowed=payload.enabled))
            else:
                state.allowed = payload.enabled
            session.commit()
            return _state_payload(session)

    @router.get("/courses")
    def list_courses(x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "list_courses")
            courses = []
            if allowed(session, "category:course_material"):
                permitted = course_access(session)
                courses = [{"id": course.id, "name": course.name}
                           for course in session.scalars(select(Course).order_by(Course.name)).all()
                           if permitted(course.id)]
            audit(session, "list_courses", None, True)
            return courses

    @router.get("/timetable")
    def get_timetable(days: int = Query(default=7, ge=1, le=30),
                      x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_timetable")
            if not allowed(session, "category:timetable"):
                audit(session, "get_timetable", None, False)
                raise HTTPException(403, "Stundenplan ist für KI gesperrt")
            start = datetime.now(settings.timezone).replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=days)
            result = timetable_context(session, start.astimezone(UTC).replace(tzinfo=None),
                                       end.astimezone(UTC).replace(tzinfo=None), settings)
            audit(session, "get_timetable", None, True)
            return {"timezone": settings.tz, "days": days, "events": result}

    @router.get("/mail")
    def get_mail_hints(days: int = Query(default=7, ge=1, le=30),
                       limit: int = Query(default=30, ge=1, le=100),
                       x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_mail_hints")
            if not allowed(session, "category:mail"):
                audit(session, "get_mail_hints", None, False)
                raise HTTPException(403, "Mail-Hinweise sind für KI gesperrt")
            since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)
            result = mail_context(session, since, limit)
            audit(session, "get_mail_hints", None, True)
            return {"days": days, "messages": result, "includes_body": False, "includes_attachments": False}

    @router.get("/courses/{course_id}/week")
    def get_weekly_study_context(course_id: int, days: int = Query(default=7, ge=1, le=30),
                                 x_unios_mcp_token: str = Header(default="")):
        """Return source pointers and open work; the assistant reads approved pages separately."""
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_weekly_study_context")
            course = session.get(Course, course_id)
            materials_allowed = allowed(session, "category:course_material")
            deadlines_allowed = allowed(session, "category:deadlines")
            if course is None or not allowed(session, f"course:{course_id}") or not (materials_allowed or deadlines_allowed):
                audit(session, "get_weekly_study_context", None, False)
                raise HTTPException(404, "Kurskontext nicht freigegeben")
            since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)
            materials = []
            if materials_allowed:
                rows = session.execute(select(Resource, ResourceVersion)
                    .join(ResourceVersion, ResourceVersion.resource_id == Resource.id)
                    .where(Resource.course_id == course_id, Resource.group_category != "other_group",
                           Resource.removed_upstream.is_(False), ResourceVersion.downloaded_at >= since)
                    .order_by(ResourceVersion.downloaded_at.desc()).limit(100)).all()
                seen: set[int] = set()
                for resource, version in rows:
                    if resource.id in seen:
                        continue
                    seen.add(resource.id)
                    materials.append({"resource_id": resource.id, "name": resource.name,
                                      "version": version.version, "downloaded_at": version.downloaded_at.isoformat()})
                    if len(materials) >= 30:
                        break
            assignments = []
            if deadlines_allowed:
                rows = session.scalars(select(Assignment).where(
                    Assignment.course_id == course_id, Assignment.removed_upstream.is_(False))
                    .order_by(Assignment.due_at, Assignment.id.desc()).limit(100)).all()
                assignments = [{"id": item.id, "title": item.title,
                                "due_at": item.due_at.isoformat() if item.due_at else None}
                               for item in rows if item.due_at is None or item.due_at >= since][:30]
            audit(session, "get_weekly_study_context", None, True)
            return {"course_id": course_id, "course_name": course.name, "days": days,
                    "materials": materials, "assignments": assignments}

    @router.get("/projects")
    def list_projects(x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "list_projects")
            if not allowed(session, "category:projects"):
                audit(session, "list_projects", None, False)
                raise HTTPException(403, "Projekte sind für KI gesperrt")
            projects = session.scalars(select(Project).where(Project.archived_at.is_(None))
                                       .order_by(Project.name)).all()
            permitted = course_access(session)
            result = [{"id": item.id, "name": item.name, "course_id": item.course_id}
                      for item in projects if permitted(item.course_id)]
            audit(session, "list_projects", None, True)
            return result

    @router.get("/projects/{project_id}/search")
    def search_project_repo(project_id: int, query: str = Query(min_length=2, max_length=100),
                            x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "search_project_repo")
            project = session.get(Project, project_id)
            if (project is None or project.archived_at is not None
                    or not allowed(session, "category:projects")
                    or not allowed(session, f"course:{project.course_id}")):
                audit(session, "search_project_repo", None, False)
                raise HTTPException(404, "Projekt nicht freigegeben")
            snapshot = session.scalar(select(RepoSnapshot).where(RepoSnapshot.project_id == project_id)
                                      .order_by(RepoSnapshot.id.desc()).limit(1))
            if snapshot is None:
                audit(session, "search_project_repo", None, False)
                raise HTTPException(404, "Repository-Sicherung nicht verfügbar")
            try:
                matches = search_snapshot(settings, project_id, snapshot.head, query)
            except RepositorySearchError as exc:
                audit(session, "search_project_repo", None, False)
                raise HTTPException(422, str(exc)) from exc
            audit(session, "search_project_repo", None, True)
            return {"project_id": project_id, "snapshot_id": snapshot.id, "matches": matches}

    @router.get("/resource/{resource_id}/text")
    def get_resource_text(resource_id: int, pages: Annotated[list[int] | None, Query()] = None,
                          x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_resource_text", resource_id)
            resource = session.get(Resource, resource_id)
            if (resource is None or resource.group_category == "other_group"
                    or not allowed(session, "category:course_material")
                    or not allowed(session, f"course:{resource.course_id}")):
                audit(session, "get_resource_text", resource_id, False)
                raise HTTPException(404, "Material nicht freigegeben")
            version = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                                     .order_by(ResourceVersion.version.desc()).limit(1))
            if version is None:
                audit(session, "get_resource_text", resource_id, False)
                raise HTTPException(404, "Materialtext nicht verfügbar")
            query = select(ResourceText).where(ResourceText.version_id == version.id)
            if pages:
                query = query.where(ResourceText.page_number.in_(pages[:100]))
            rows = session.scalars(query.order_by(ResourceText.page_number)).all()
            result = [{"page": row.page_number, "text": row.markdown or row.text} for row in rows]
            if sum(len(row["text"].encode("utf-8")) for row in result) > 200_000:
                audit(session, "get_resource_text", resource_id, False)
                raise HTTPException(413, "Materialtext zu lang; Seiten einzeln anfordern")
            audit(session, "get_resource_text", resource_id, True)
            return {"resource_id": resource.id, "name": resource.name,
                    "version": version.version, "pages": result}

    @router.get("/search")
    def search(query: str = Query(min_length=2, max_length=100),
               course_id: int | None = Query(default=None, gt=0),
               x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "search")
            if not allowed(session, "category:course_material"):
                audit(session, "search", None, False)
                raise HTTPException(403, "Kursmaterial ist für KI gesperrt")
            latest_version = select(func.max(ResourceVersion.version)).where(
                ResourceVersion.resource_id == Resource.id).correlate(Resource).scalar_subquery()
            statement = select(ResourceText, ResourceVersion, Resource).join(
                ResourceVersion, ResourceVersion.id == ResourceText.version_id).join(
                    Resource, Resource.id == ResourceVersion.resource_id).where(
                        ResourceText.text.contains(query, autoescape=True),
                        Resource.group_category != "other_group",
                        ResourceVersion.version == latest_version,
                    )
            if course_id is not None:
                statement = statement.where(Resource.course_id == course_id)
            rows = session.execute(statement.order_by(ResourceText.id.desc()).limit(200)).all()
            hits = []
            permitted = course_access(session)
            for page, version, resource in rows:
                if not permitted(resource.course_id):
                    continue
                index = page.text.casefold().find(query.casefold())
                start = max(0, index - 100) if index >= 0 else 0
                hits.append({"resource_id": resource.id, "resource_name": resource.name,
                             "version": version.version, "page": page.page_number,
                             "snippet": page.text[start:start + 240]})
                if len(hits) >= 20:
                    break
            audit(session, "search", None, True)
            return hits

    @router.get("/changes")
    def get_changes(since: datetime, x_unios_mcp_token: str = Header(default="")):
        if since.tzinfo is None:
            raise HTTPException(422, "Zeitangabe benötigt eine Zeitzone")
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_changes")
            if not allowed(session, "category:course_material"):
                audit(session, "get_changes", None, False)
                raise HTTPException(403, "Kursmaterial ist für KI gesperrt")
            rows = session.execute(select(Change, Resource).join(
                Resource, Resource.id == Change.resource_id).where(
                    Change.kind.in_(["new", "updated"]),
                    Change.created_at >= since.astimezone(UTC).replace(tzinfo=None),
                    Resource.group_category != "other_group",
                ).order_by(Change.created_at.desc()).limit(200)).all()
            permitted = course_access(session)
            result = [{"resource_id": resource.id, "name": resource.name,
                       "changed_at": change.created_at.isoformat()}
                      for change, resource in rows if permitted(resource.course_id)][:30]
            audit(session, "get_changes", None, True)
            return result

    @router.get("/deadlines")
    def get_deadlines(days: int = Query(default=14, ge=1, le=60),
                      x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_deadlines")
            if not allowed(session, "category:deadlines"):
                audit(session, "get_deadlines", None, False)
                raise HTTPException(403, "Fristen sind für KI gesperrt")
            now = datetime.now(UTC).replace(tzinfo=None)
            rows = session.scalars(select(Deadline).where(
                Deadline.course_id.is_not(None), Deadline.removed_upstream.is_(False),
                Deadline.due_at >= now, Deadline.due_at <= now + timedelta(days=days),
            ).order_by(Deadline.due_at).limit(100)).all()
            permitted = course_access(session)
            result = [{"title": row.title, "due_at": row.due_at.isoformat(), "course_id": row.course_id}
                      for row in rows if permitted(row.course_id)]
            audit(session, "get_deadlines", None, True)
            return result

    @router.get("/anki-status")
    def get_anki_status(x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_anki_status")
            # Free note cards have no resource; their course comes from the learning topic.
            owner_course = func.coalesce(Resource.course_id, LearningTopic.course_id)
            rows = session.execute(select(AnkiCardQueue, owner_course)
                .outerjoin(Resource, Resource.id == AnkiCardQueue.resource_id)
                .outerjoin(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id)
                .where(or_(Resource.id.is_(None), Resource.group_category != "other_group"))).all()
            permitted = course_access(session)
            visible = [item for item, course_id in rows if course_id is not None and permitted(course_id)]
            note_rows = session.execute(select(AnkiCard.id, owner_course)
                .join(AnkiCardQueue, AnkiCardQueue.id == AnkiCard.queue_id)
                .outerjoin(Resource, Resource.id == AnkiCardQueue.resource_id)
                .outerjoin(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id)
                .where(or_(Resource.id.is_(None), Resource.group_category != "other_group"))).all()
            note_ids = [note_id for note_id, course_id in note_rows if course_id is not None and permitted(course_id)]
            review_count = (session.scalar(select(func.count(AnkiReview.id)).where(
                AnkiReview.card_id.in_(note_ids))) or 0) if note_ids else 0
            audit(session, "get_anki_status", None, True)
            return {"proposed": sum(item.status == "proposed" for item in visible),
                    "approved": sum(item.status == "approved" for item in visible),
                    "pushed": sum(item.status == "pushed" for item in visible),
                    "reviews": review_count}

    @router.get("/exam-status")
    def get_exam_status(x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_exam_status")
            if not allowed(session, "category:exam_status"):
                audit(session, "get_exam_status", None, False)
                raise HTTPException(403, "Prüfungsstatus ist für KI gesperrt")
            registrations = session.scalars(select(ExamRegistration)
                                            .order_by(ExamRegistration.checked_at.desc(), ExamRegistration.id.desc())).all()
            latest: dict[int, ExamRegistration] = {}
            for registration in registrations:
                latest.setdefault(registration.exam_id, registration)
            exams = session.scalars(select(Exam).order_by(Exam.id.desc()).limit(100)).all()
            permitted = course_access(session)
            result = [{"id": exam.id, "title": exam.title, "course_id": exam.course_id,
                       "exam_at": exam.exam_at, "status": latest[exam.id].status if exam.id in latest else "unclear",
                       "checked_at": latest[exam.id].checked_at if exam.id in latest else None}
                      for exam in exams if permitted(exam.course_id)]
            audit(session, "get_exam_status", None, True)
            return result

    @router.get("/submission-status")
    def get_submission_status(course_id: int | None = Query(default=None, gt=0),
                              x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "get_submission_status")
            if not allowed(session, "category:submission_status"):
                audit(session, "get_submission_status", None, False)
                raise HTTPException(403, "Abgabestatus ist für KI gesperrt")
            if course_id is not None and (session.get(Course, course_id) is None
                                          or not allowed(session, f"course:{course_id}")):
                audit(session, "get_submission_status", None, False)
                raise HTTPException(404, "Kurs nicht freigegeben")
            query = select(Assignment).where(Assignment.removed_upstream.is_(False))
            if course_id is not None:
                query = query.where(Assignment.course_id == course_id)
            assignments = session.scalars(query.order_by(Assignment.id.desc()).limit(100)).all()
            result = []
            permitted = course_access(session)
            for assignment in assignments:
                if not permitted(assignment.course_id):
                    continue
                try:
                    check = latest_check(settings, assignment.id)
                except (OSError, ValueError):
                    audit(session, "get_submission_status", assignment.id, False)
                    raise HTTPException(503, "Gespeicherter Abgabestatus konnte nicht gelesen werden") from None
                result.append({"assignment_id": assignment.id, "course_id": assignment.course_id,
                               "title": assignment.title, "due_at": assignment.due_at,
                               "status": check.status if check else "not_checked",
                               "checked_at": check.checked_at if check else None})
            audit(session, "get_submission_status", None, True)
            return result

    @router.post("/cards", status_code=201)
    def submit_anki_candidates(payload: CardImport, x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "submit_anki_candidates", payload.source.resource_id)
            try:
                cards = enqueue_cards(session, settings, payload)
            except HTTPException:
                audit(session, "submit_anki_candidates", payload.source.resource_id, False)
                raise
            audit(session, "submit_anki_candidates", payload.source.resource_id, True)
            return {"created": len(cards), "status": "proposed"}

    @router.post("/exercises", status_code=201)
    def submit_exercises(payload: ExerciseImport, x_unios_mcp_token: str = Header(default="")):
        with factory() as session:
            authorize(session, x_unios_mcp_token, "submit_exercises", payload.source.resource_id)
            try:
                exercises = enqueue_exercises(session, payload)
            except HTTPException:
                audit(session, "submit_exercises", payload.source.resource_id, False)
                raise
            audit(session, "submit_exercises", payload.source.resource_id, True)
            return {"created": len(exercises), "status": "proposed"}

    @router.get("/audit")
    def access_log(request: Request, x_unios_mcp_token: str = Header(default="")):
        if not _authorized_reader(request, settings, x_unios_mcp_token):
            raise HTTPException(403, "Protokoll nur mit KI-Token oder vom Dashboard sichtbar")
        with factory() as session:
            rows = session.scalars(select(AiToolAccess).order_by(AiToolAccess.id.desc()).limit(100)).all()
            return [{"at": row.accessed_at, "tool": row.tool,
                     "resource_id": row.resource_id, "permitted": row.permitted,
                     "actor": row.actor} for row in rows]

    from app.corpus.api import agent_router
    router.include_router(agent_router(settings, factory, authorize, audit, mcp_actor.get,
                                       mcp_scopes.get, dispatch_action, cache))
    return router
