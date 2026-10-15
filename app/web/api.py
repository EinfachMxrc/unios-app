# SPDX-License-Identifier: AGPL-3.0-or-later

"""JSON endpoints used by the Vite/React dashboard."""
import json
import logging
import re
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.calendar.dedupe import visible_events
from app.catalog.repository import CatalogRepository
from app.catalog.service import CatalogService
from app.config import Settings
from app.courses.classification import DOCUMENT_SOURCES, teaching_courses
from app.db.models import (
    Assignment,
    Change,
    ConnectorHealth,
    Course,
    CourseSection,
    Deadline,
    Note,
    Resource,
    SectionGroupAssignment,
    Semester,
    SyncRun,
    utc_now,
)
from app.extract.offline import offline_search_index
from app.extract.search import (
    search_annotations,
    search_announcements,
    search_course_notes,
    search_documents,
)
from app.files.sidecars import (
    resource_state_for,
    safe_external_url,
    write_file_state_sidecar,
    write_link_sidecar,
)
from app.health.doctor import doctor_report
from app.host.lease import HostCoordinator, HostLeaseError
from app.host.snapshots import create_snapshot, snapshot_health
from app.inbox.search import search_clips
from app.jots.store import (
    JotConflict,
    JotError,
    JotMissing,
    assign,
    capture,
    search_jots,
)
from app.notes.related import related_notes
from app.notes.store import (
    NoteConflict,
    NoteCorrupt,
    NoteError,
    NoteMissing,
    create_note,
    read_note,
    search_notes,
    update_note,
)
from app.search.service import search_structured
from app.sync.continuity import sync_continuity
from app.sync.status_repository import latest_sync_status
from app.web.schemas import (
    ActivityView,
    CourseDetailView,
    CoursesView,
    DeadlinesView,
    DoctorView,
    JotsView,
    JotView,
    NoteDetailView,
    NotesView,
    OfflineSearchIndexView,
    OkView,
    OverviewView,
    RelatedNoteView,
    ResourceVersionsView,
    SearchView,
    SemesterView,
    SnapshotHealthView,
    SyncRunView,
    SyncStatusView,
    SystemView,
)

log = logging.getLogger(__name__)


def record(item):
    data = {column.name: getattr(item, column.name) for column in item.__table__.columns}
    if "url" in data:
        local_reader_url = (isinstance(item, Deadline) and isinstance(data["url"], str)
                            and re.fullmatch(r"/material/[1-9]\d*\?page=[1-9]\d*", data["url"]))
        if not local_reader_url:
            data["url"] = safe_external_url(data["url"], allow_http=isinstance(item, Resource))
        if isinstance(item, Resource) and data["url"] is None:
            data["url"] = ""
    return data


class SemesterInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    starts_at: datetime
    ends_at: datetime


class SemesterAssignment(BaseModel):
    semester_id: int


class GroupAssignmentInput(BaseModel):
    status: str


class GroupDownloadInput(BaseModel):
    download_other_groups: bool


class JotInput(BaseModel):
    id: str
    kind: str
    body: str = Field(min_length=1, max_length=10_000)
    created_at: datetime
    course_id: int | None = None
    note_id: str | None = None


class JotAssignmentInput(BaseModel):
    course_id: int | None = None
    note_id: str | None = None


class NoteCreateInput(BaseModel):
    course_id: int = Field(gt=0)
    resource_id: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(max_length=100_000)


class NoteUpdateInput(BaseModel):
    expected_revision: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(max_length=100_000)


def make_api_router(settings: Settings, factory, sync_engine, connectors,
                    coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api")
    def moodle_configured() -> bool:
        return bool(settings.moodle_enabled and settings.moodle_base_url and settings.moodle_token
                    and any(connector.name == "moodle" for connector in connectors))

    def publish_resource_states(session, resources: list[Resource]) -> None:
        coordinator.assert_writer()
        observed_at = utc_now()
        for resource in resources:
            state = resource_state_for(session, resource, observed_at=observed_at)
            if resource.kind == "link":
                write_link_sidecar(settings.data_dir, state)
            else:
                write_file_state_sidecar(settings.data_dir, state)

    def current_snapshot_status():
        lease = coordinator.current()
        return snapshot_health(settings.data_dir / "host" / "snapshots",
                               lease.generation if lease else None,
                               lease.device_id if lease else None,
                               settings.snapshot_interval_seconds)

    def note_summary(session, note: Note) -> dict:
        course = session.get(Course, note.course_id)
        if course is None:
            raise HTTPException(503, "Notizkurs fehlt")
        return {**record(note), "course_name": course.name}

    def note_detail(session, note_id: str, revision: int | None = None) -> dict:
        try:
            note, selected, body, versions = read_note(session, settings, note_id, revision)
        except NoteMissing as exc:
            raise HTTPException(404, str(exc)) from None
        except NoteCorrupt as exc:
            raise HTTPException(503, str(exc)) from None
        except Exception as exc:  # noqa: BLE001 - never log note contents or local paths
            log.warning("Notiz konnte nicht gelesen werden: %s", type(exc).__name__)
            raise HTTPException(503, "Notiz konnte nicht gelesen werden") from None
        return {"note": note_summary(session, note), "selected_revision": selected.revision,
                "body": body, "versions": [record(item) for item in versions]}

    def valid_note_id(value: str) -> str:
        try:
            return str(UUID(value))
        except ValueError:
            raise HTTPException(404, "Notiz nicht gefunden") from None

    @router.get("/overview", response_model=OverviewView)
    def overview():
        now = datetime.now(settings.timezone)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC).replace(tzinfo=None)
        utc_now = now.astimezone(UTC).replace(tzinfo=None)
        with factory() as session:
            changes = session.scalars(select(Change).outerjoin(Resource, Change.resource_id == Resource.id)
                .outerjoin(Course, Change.course_id == Course.id).where(
                Change.created_at >= start, Change.kind.in_(["new", "updated", "assignment"]),
                (Change.course_id.is_(None) | Course.is_active.is_(True)),
                (Change.resource_id.is_(None) | (Resource.group_category != "other_group"))
            ).order_by(Change.created_at.desc()).limit(20)).all()
            deadlines = session.scalars(select(Deadline).where(Deadline.removed_upstream.is_(False),
                Deadline.due_at >= utc_now, Deadline.due_at <= utc_now + timedelta(days=14)).order_by(Deadline.due_at).limit(10)).all()
            latest = session.scalar(select(SyncRun).order_by(SyncRun.id.desc()).limit(1))
            warnings = session.scalars(select(ConnectorHealth).where(ConnectorHealth.status != "ok")).all()
            courses = {item.id: item.name for item in session.scalars(select(Course)).all()}
            return {
                "date": now.date().isoformat(), "moodle_enabled": settings.moodle_enabled,
                "moodle_configured": moodle_configured(),
                "new_files": sum(item.kind == "new" for item in changes),
                "new_assignments": sum(item.kind == "assignment" for item in changes),
                "changes": [record(item) for item in changes], "deadlines": [record(item) for item in deadlines],
                "courses": courses, "warnings": [record(item) for item in warnings],
                "pending_group_courses": [record(item) for item in session.scalars(select(Course).join(CourseSection)
                    .join(SectionGroupAssignment).where(SectionGroupAssignment.needs_confirmation.is_(True),
                                                        Course.is_active.is_(True), teaching_courses()).distinct()).all()],
                "latest_sync": record(latest) if latest else None,
                "sync_continuity": asdict(sync_continuity(session, settings.stale_sync_hours)),
            }

    @router.get("/courses", response_model=CoursesView)
    def courses(all_semesters: bool = False, include_inactive: bool = False, documents: bool = False):
        with factory() as session:
            query = select(Course).where(Course.source.in_(DOCUMENT_SOURCES) if documents else teaching_courses()).order_by(Course.name)
            if not include_inactive:
                query = query.where(Course.is_active.is_(True))
            if not all_semesters:
                query = query.join(Semester).where(Semester.is_current.is_(True))
            return {"courses": [record(item) for item in session.scalars(query).all()],
                    "semesters": [record(item) for item in session.scalars(select(Semester).order_by(Semester.id.desc())).all()]}

    @router.get("/courses/{course_id}", response_model=CourseDetailView)
    def course_detail(course_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                      q: str = Query('', max_length=200), resource_id: int | None = Query(None, ge=1)):
        try:
            return CatalogService(CatalogRepository(factory)).course(course_id, offset, limit, q, resource_id, record)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None

    @router.get('/resources/{resource_id}/versions', response_model=ResourceVersionsView)
    def resource_versions(resource_id: int, offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
        try:
            versions, page = CatalogService(CatalogRepository(factory)).versions(resource_id, offset, limit)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        return {'versions': [record(version) for version in versions], 'page': page}

    @router.post("/courses/{course_id}/semester", response_model=OkView)
    def assign_semester(course_id: int, payload: SemesterAssignment):
        with factory() as session:
            course = session.get(Course, course_id)
            semester = session.get(Semester, payload.semester_id)
            if not course or not semester:
                raise HTTPException(404, "Kurs oder Semester nicht gefunden")
            course.semester_id = semester.id
            resources = session.scalars(select(Resource).where(Resource.course_id == course_id)).all()
            publish_resource_states(session, resources)
            session.commit()
        return {"ok": True}

    @router.post("/courses/{course_id}/sections/{section_id}/group", response_model=OkView)
    def assign_group(course_id: int, section_id: int, payload: GroupAssignmentInput):
        if payload.status not in {"general", "own_group", "other_group"}:
            raise HTTPException(400, "Ungültige Gruppenzuordnung")
        with factory() as session:
            section = session.get(CourseSection, section_id)
            if not section or section.course_id != course_id:
                raise HTTPException(404, "Abschnitt nicht gefunden")
            assignment = session.scalar(select(SectionGroupAssignment).where(SectionGroupAssignment.section_id == section_id))
            if assignment is None:
                assignment = SectionGroupAssignment(section_id=section_id)
                session.add(assignment)
            assignment.status = payload.status
            assignment.needs_confirmation = False
            assignment.updated_at = utc_now()
            resources = session.scalars(select(Resource).where(Resource.section_id == section_id)).all()
            for resource in resources:
                resource.group_category = payload.status
            publish_resource_states(session, resources)
            session.commit()
        return {"ok": True}

    @router.post("/courses/{course_id}/group-download", response_model=OkView)
    def group_download(course_id: int, payload: GroupDownloadInput):
        with factory() as session:
            course = session.get(Course, course_id)
            if not course:
                raise HTTPException(404, "Kurs nicht gefunden")
            course.download_other_groups = payload.download_other_groups
            resources = session.scalars(select(Resource).where(Resource.course_id == course_id)).all()
            publish_resource_states(session, resources)
            session.commit()
        return {"ok": True}

    @router.get("/search", response_model=SearchView)
    def search(q: str = "", course_id: int | None = None, semester_id: int | None = None, type: str | None = None):
        if len(q) > 400:
            raise HTTPException(400, "Suchbegriff zu lang")
        with factory() as session:
            try:
                structured = search_structured(session, q + (" type:" + type if type else ""), course_id, semester_id) if ":" in q or type else None
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from None
            if structured is not None:
                return {**structured, "courses": [record(item) for item in session.scalars(select(Course).where(teaching_courses()).order_by(Course.name)).all()],
                        "semesters": [record(item) for item in session.scalars(select(Semester).order_by(Semester.id.desc())).all()]}
            return {"results": search_documents(session, q, course_id, semester_id) if q.strip() else [],
                    "announcement_results": search_announcements(session, q, course_id, semester_id)
                    if q.strip() else [],
                    "annotation_results": search_annotations(session, q, course_id, semester_id)
                    if q.strip() else [],
                    "course_note_results": search_course_notes(session, q, course_id, semester_id)
                    if q.strip() else [],
                    "note_results": search_notes(session, q, course_id=course_id, semester_id=semester_id)
                    if q.strip() else [],
                    "jot_results": search_jots(session, q, course_id=course_id, semester_id=semester_id)
                    if q.strip() else [],
                    "clip_results": search_clips(session, q, course_id, semester_id) if q.strip() else [],
                    **(structured or {}),
                    "courses": [record(item) for item in session.scalars(select(Course).where(teaching_courses()).order_by(Course.name)).all()],
                    "semesters": [record(item) for item in session.scalars(select(Semester).order_by(Semester.id.desc())).all()]}

    @router.get("/search/offline-index", response_model=OfflineSearchIndexView)
    def search_offline_index(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        with factory() as session:
            return {"items": offline_search_index(session)}

    @router.get("/jots", response_model=JotsView)
    def jots(course_id: int | None = None, offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
             jot_id: UUID | None = None):
        return CatalogService(CatalogRepository(factory)).jots(
            course_id, offset, limit, str(jot_id) if jot_id is not None else None, record)

    @router.post("/jots", response_model=JotView)
    def add_jot(payload: JotInput):
        coordinator.assert_writer()
        with factory() as session:
            try:
                jot = capture(session, jot_id=payload.id, kind=payload.kind, body=payload.body,
                              created_at=payload.created_at, course_id=payload.course_id, note_id=payload.note_id,
                              settings=settings)
            except JotMissing as exc:
                raise HTTPException(404, str(exc)) from None
            except JotConflict as exc:
                raise HTTPException(409, str(exc)) from None
            except JotError as exc:
                raise HTTPException(400, str(exc)) from None
            except Exception as exc:  # noqa: BLE001 - never log captured content or SQL parameters
                log.warning("Schnellerfassung konnte nicht gespeichert werden: %s", type(exc).__name__)
                raise HTTPException(503, "Eintrag konnte nicht gespeichert werden") from None
            task = session.scalar(select(Assignment).where(Assignment.source == "smart_capture",
                                                           Assignment.source_key == jot.id))
            return {**record(jot), "task_id": task.id if task else None,
                    "task_course_id": task.course_id if task else None}

    @router.patch("/jots/{jot_id}/assignment", response_model=JotView)
    def assign_jot(jot_id: str, payload: JotAssignmentInput):
        coordinator.assert_writer()
        with factory() as session:
            try:
                jot = assign(session, jot_id, course_id=payload.course_id, note_id=payload.note_id, settings=settings)
            except JotMissing as exc:
                raise HTTPException(404, str(exc)) from None
            except JotError as exc:
                raise HTTPException(400, str(exc)) from None
            except Exception as exc:  # noqa: BLE001 - never log captured content or SQL parameters
                log.warning("Schnellerfassung konnte nicht zugeordnet werden: %s", type(exc).__name__)
                raise HTTPException(503, "Eintrag konnte nicht zugeordnet werden") from None
            task = session.scalar(select(Assignment).where(Assignment.source == "smart_capture",
                                                           Assignment.source_key == jot.id))
            return {**record(jot), "task_id": task.id if task else None,
                    "task_course_id": task.course_id if task else None}

    @router.get("/notes", response_model=NotesView)
    def notes(course_id: int | None = None, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
              q: str = Query('', max_length=200)):
        return CatalogService(CatalogRepository(factory)).notes(course_id, offset, limit, q, record)

    @router.get("/notes/{note_id}", response_model=NoteDetailView)
    def get_note(note_id: str, revision: int | None = Query(default=None, ge=1)):
        with factory() as session:
            return note_detail(session, valid_note_id(note_id), revision)

    @router.get("/notes/{note_id}/related", response_model=list[RelatedNoteView])
    def get_related_notes(note_id: str):
        with factory() as session:
            valid_id = valid_note_id(note_id)
            if session.get(Note, valid_id) is None:
                raise HTTPException(404, "Notiz nicht gefunden")
            return related_notes(session, valid_id)

    @router.post("/notes", response_model=NoteDetailView, status_code=201)
    def add_note(payload: NoteCreateInput,
                 x_unios_lease_generation: int | None = Header(default=None)):
        def verify_lease() -> None:
            coordinator.assert_writer()
            lease = coordinator.current()
            if (x_unios_lease_generation is not None and
                    (lease is None or lease.generation != x_unios_lease_generation)):
                raise HTTPException(409, "STALE_HOST: Staffelstab-Generation hat sich geändert")

        verify_lease()
        with factory() as session:
            try:
                note = create_note(session, settings, course_id=payload.course_id,
                                   resource_id=payload.resource_id, title=payload.title, body=payload.body,
                                   before_commit=verify_lease)
                return note_detail(session, note.id)
            except NoteMissing as exc:
                raise HTTPException(404, str(exc)) from None
            except NoteError as exc:
                raise HTTPException(400, str(exc)) from None
            except HTTPException:
                raise
            except HostLeaseError:
                raise HTTPException(423, "WRITE_LEASE_LOST: Schreibrecht wurde entzogen") from None
            except Exception as exc:  # noqa: BLE001 - never log note contents or local paths
                log.warning("Notiz konnte nicht angelegt werden: %s", type(exc).__name__)
                raise HTTPException(503, "Notiz konnte nicht angelegt werden") from None

    @router.put("/notes/{note_id}", response_model=NoteDetailView)
    def save_note(note_id: str, payload: NoteUpdateInput,
                  x_unios_lease_generation: int | None = Header(default=None)):
        def verify_lease() -> None:
            coordinator.assert_writer()
            lease = coordinator.current()
            if (x_unios_lease_generation is not None and
                    (lease is None or lease.generation != x_unios_lease_generation)):
                raise HTTPException(409, "STALE_HOST: Staffelstab-Generation hat sich geändert")

        verify_lease()
        with factory() as session:
            try:
                note = update_note(session, settings, valid_note_id(note_id),
                                   expected_revision=payload.expected_revision,
                                   title=payload.title, body=payload.body,
                                   before_commit=verify_lease)
                return note_detail(session, note.id)
            except NoteMissing as exc:
                raise HTTPException(404, str(exc)) from None
            except NoteConflict as exc:
                raise HTTPException(409, str(exc)) from None
            except NoteCorrupt as exc:
                raise HTTPException(503, str(exc)) from None
            except NoteError as exc:
                raise HTTPException(400, str(exc)) from None
            except HTTPException:
                raise
            except HostLeaseError:
                raise HTTPException(423, "WRITE_LEASE_LOST: Schreibrecht wurde entzogen") from None
            except Exception as exc:  # noqa: BLE001 - never log note contents or local paths
                log.warning("Notiz konnte nicht gespeichert werden: %s", type(exc).__name__)
                raise HTTPException(503, "Notiz konnte nicht gespeichert werden") from None

    @router.get("/deadlines", response_model=DeadlinesView)
    def deadlines():
        with factory() as session:
            return {"deadlines": [record(item) for item in session.scalars(select(Deadline)
                .where(Deadline.removed_upstream.is_(False)).order_by(Deadline.due_at)).all()],
                "events": [record(item) for item in visible_events(session, settings)[:200]],
                "courses": {item.id: item.name for item in session.scalars(select(Course)).all()}}

    @router.get("/activity", response_model=ActivityView)
    def activity(course_id: int | None = None, kind: str | None = None,
                 from_date: str | None = None, to_date: str | None = None):
        with factory() as session:
            query = select(Change)
            if course_id:
                query = query.where(Change.course_id == course_id)
            if kind:
                query = query.where(Change.kind.in_(["new", "updated", "assignment", "removed_upstream"])
                                    if kind == "content" else Change.kind == kind)
            try:
                if from_date:
                    start = datetime.fromisoformat(from_date).replace(tzinfo=settings.timezone).astimezone(UTC).replace(tzinfo=None)
                    query = query.where(Change.created_at >= start)
                if to_date:
                    end = (datetime.fromisoformat(to_date) + timedelta(days=1)).replace(tzinfo=settings.timezone).astimezone(UTC).replace(tzinfo=None)
                    query = query.where(Change.created_at < end)
            except ValueError:
                raise HTTPException(400, "Ungültiges Datum") from None
            return {"changes": [record(item) for item in session.scalars(query.order_by(Change.created_at.desc()).limit(200)).all()],
                    "courses": [record(item) for item in session.scalars(select(Course).where(teaching_courses()).order_by(Course.name)).all()]}

    @router.get("/system", response_model=SystemView)
    def system():
        snapshot = current_snapshot_status()
        with factory() as session:
            status_dir = settings.data_dir / "backup-status"
            backup_files = sorted(status_dir.glob("*.json")) if status_dir.exists() else []
            backup = json.loads(backup_files[-1].read_text(encoding="utf-8")) if backup_files else None
            return {"moodle_enabled": settings.moodle_enabled, "moodle_configured": moodle_configured(),
                    "runs": [record(item) for item in session.scalars(select(SyncRun).order_by(SyncRun.id.desc()).limit(200)).all()],
                    "health": [record(item) for item in session.scalars(select(ConnectorHealth).order_by(ConnectorHealth.connector)).all()],
                    "semesters": [record(item) for item in session.scalars(select(Semester).order_by(Semester.id.desc())).all()],
                    "backup": backup, "snapshot": asdict(snapshot),
                    "sync_continuity": asdict(sync_continuity(session, settings.stale_sync_hours))}

    @router.get("/doctor", response_model=DoctorView)
    def doctor():
        return doctor_report(settings)

    @router.post("/host/snapshot", response_model=SnapshotHealthView)
    def create_host_snapshot():
        try:
            create_snapshot(coordinator)
            status = current_snapshot_status()
            if status.status != "ok":
                raise ValueError("Snapshot-Prüfung fehlgeschlagen")
            return asdict(status)
        except HostLeaseError:
            raise HTTPException(423, "Kein Staffelstab für Snapshot") from None
        except Exception as exc:  # noqa: BLE001 - API must not reveal database paths or secrets
            log.warning("Manueller Snapshot fehlgeschlagen: %s", type(exc).__name__)
            raise HTTPException(503, "Snapshot fehlgeschlagen; Datenbank und Schreibrechte prüfen") from None

    @router.post("/semesters", response_model=SemesterView)
    def create_semester(payload: SemesterInput):
        if payload.starts_at.tzinfo is None or payload.ends_at.tzinfo is None or payload.ends_at <= payload.starts_at:
            raise HTTPException(400, "Gültigen Semesterzeitraum mit Zeitzone angeben")
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Name fehlt")
        with factory() as session:
            if session.scalar(select(Semester).where(Semester.name == name)):
                raise HTTPException(409, "Semester existiert bereits")
            for item in session.scalars(select(Semester).where(Semester.is_current.is_(True))).all():
                item.is_current = False
            semester = Semester(name=name, starts_at=payload.starts_at, ends_at=payload.ends_at, is_current=True)
            session.add(semester)
            session.commit()
            return record(semester)

    @router.get("/sync/status", response_model=SyncStatusView)
    def sync_status():
        running = sync_engine.running
        run_id, status = latest_sync_status(factory)
        return {"running": running or sync_engine.running, "last_run_id": run_id, "last_status": status}

    @router.post("/sync", response_model=SyncRunView)
    def sync():
        if not connectors:
            raise HTTPException(409, "Noch kein Connector konfiguriert")
        result = sync_engine.run(record_action=False)  # The HTTP middleware journals this user action.
        if result is None:
            raise HTTPException(409, "Sync läuft bereits")
        return record(result)

    return router
