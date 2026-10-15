# SPDX-License-Identifier: AGPL-3.0-or-later

import logging
import sqlite3
import traceback
from collections.abc import Callable
from contextlib import asynccontextmanager
from importlib.metadata import version
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from app.activity.api import activity_router
from app.activity.repository import ActivityRepository
from app.activity.service import ActivityService
from app.addons.api import addon_router
from app.addons.repository import AddonRepository
from app.addons.service import AddonService
from app.ai.api import ai_router
from app.ai.connection import McpConnection, load_mcp_connection
from app.ai.connection_api import connection_router
from app.ai.exercises import exercise_router
from app.ai.explanations import explanation_router
from app.ai.mcp_api import mcp_router
from app.analytics.api import analytics_router
from app.analytics.repository import AnalyticsRepository
from app.analytics.service import AnalyticsService
from app.anki.api import card_queue_router
from app.assessment.api import assessment_router
from app.assessment.repository import AssessmentRepository
from app.assessment.service import AssessmentService
from app.assignments.api import assignment_router
from app.backups.api import backup_router
from app.calendar.api import timetable_router
from app.calendar.feed import EXPORT_SOURCES, build_calendar
from app.calendar.service import TimetableService
from app.capabilities.api import capability_router
from app.capabilities.repository import CapabilityRepository
from app.capabilities.service import CapabilityService
from app.coding.api import coding_router
from app.coding.repository import CodingRepository
from app.coding.runner import Judge0Backend
from app.coding.service import CodingService
from app.collections.api import collections_router
from app.config import Settings, get_settings
from app.connectors.api import connector_registry_router
from app.connectors.moodle.client import MoodleClient
from app.connectors.plugins import ConnectorPluginError, load_connector_plugins
from app.connectors.selection import ConnectorSelection
from app.corpus.api import corpus_status_router, source_router
from app.corpus.cache import RetrievalCache
from app.corpus.repository import CorpusRepository
from app.corpus.worker import CorpusWorker
from app.courses.api import course_router
from app.courses.enrolment_api import enrolment_router
from app.cycles.api import cycles_router
from app.cycles.repository import CycleRepository
from app.cycles.service import CycleService
from app.db.models import ResourceVersion
from app.db.session import make_engine, make_session_factory
from app.deadline_proposals.api import proposal_router
from app.digest.api import digest_router
from app.drop.api import drop_router
from app.entities.actions import EntityActions
from app.entities.api import entities_router
from app.export.api import export_router
from app.extract.jobs import IndexJobs
from app.extract.ocr_api import ocr_router
from app.extract.ocr_repository import OCRRepository
from app.extract.ocr_service import OCRService
from app.extract.service import document_markdown
from app.feedback.api import feedback_router
from app.files.localpath import resolve_local
from app.grades.api import grade_router
from app.health.logging import configure_logging
from app.host.actions import ActionJournal
from app.host.api import conflict_router
from app.host.handoff import acquire_stale, require_syncthing_ready
from app.host.lease import HostCoordinator, HostLeaseError
from app.host.monitor import StandbyMonitor
from app.host.release import release_running_host
from app.host.write_gate import WriteGate, WriteGateBusy
from app.inbox.api import inbox_router
from app.intake.api import intake_router
from app.intake.repository import IntakeRepository
from app.intake.service import IntakeService
from app.jobs.api import jobs_router
from app.jobs.handlers import handlers as job_handlers
from app.jobs.repository import JobRepository
from app.jobs.service import BackgroundJobs
from app.journal.api import journal_router
from app.learning.api import learning_router
from app.learning.focus_api import focus_router
from app.learning.focus_repository import FocusRepository
from app.learning.focus_service import FocusService
from app.learning.practice import practice_router
from app.links.api import links_router
from app.local_actions.api import local_actions_router
from app.local_actions.service import LocalActions
from app.mail.api import mail_router
from app.mail.connection_api import mail_connection_router
from app.mail.forwarding import MailForwardingService
from app.mail.forwarding_api import mail_forwarding_router
from app.mail.service import MailService
from app.material.api import material_router
from app.material.viewable import MAX_TEXT_BYTES, TEXT, view_for
from app.mensa.api import mensa_router
from app.metadata.api import metadata_router
from app.modules.api import modules_router
from app.modules.repository import ModuleRepository
from app.modules.service import ModuleService
from app.notes.link_api import note_links_router
from app.notes.link_repository import NoteLinkRepository
from app.notes.link_service import NoteLinkService
from app.notes.media_api import note_media_router
from app.notes.peek_api import peek_router
from app.notes.references_api import references_router
from app.notify.api import notification_router
from app.notify.center import NotificationCenter
from app.notify.service import Notifier
from app.peek.api import peek_router as task_peek_router
from app.peek.repository import PeekRepository
from app.peek.service import PeekService
from app.portals.campus_api import campus_import_router
from app.portals.campus_job_service import CampusImportJob
from app.portals.mycampus import mycampus_router
from app.portals.primuss import primuss_router
from app.portals.public_periods import public_periods_router
from app.projects.api import project_router
from app.release.api import release_health_router
from app.release.repository import ReleaseHealthRepository
from app.release.service import ReleaseHealthService
from app.rooms.api import rooms_router
from app.rules.api import rules_router
from app.runtime.api import runtime_router
from app.runtime.repository import RuntimeRepository
from app.runtime.service import RuntimeService
from app.session_api import (
    session_router,
)
from app.setup.api import setup_router
from app.submissions.api import submission_router
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler
from app.trash.api import trash_router
from app.voice.api import voice_router
from app.web.api import make_api_router
from app.web.contracts import RecoveryStatusView
from app.web.middleware import install_http_middleware
from app.web.schemas import HostView

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, connectors=None, start_scheduler: bool = True,
               coordinator: HostCoordinator | None = None) -> FastAPI:
    settings = settings or get_settings()
    load_mcp_connection(settings)
    anki_router: Callable[[Settings, Any, HostCoordinator, Any, Any], APIRouter] | None = None
    try:
        from app.anki.manual_api import manual_router
        from app.anki.study_api import study_router
        from app.anki.study_repository import StudyRepository
        from app.anki.study_service import StudyService
        from app.anki.transfer_service import TransferService
        anki_router = study_router
        anki_available = True
    except ImportError as exc:
        log.warning("Integrierter Anki-Modus nicht verfügbar: %s", type(exc).__name__)
        anki_available = False
    owns_coordinator = coordinator is None
    coordinator = coordinator or HostCoordinator(settings)
    engine = make_engine(settings, coordinator)
    factory = make_session_factory(engine)
    notifier = Notifier(settings, coordinator)
    unavailable_plugins: list[str] = []
    if connectors is None:
        connectors = [MoodleClient(settings)] if settings.moodle_enabled and settings.moodle_base_url and settings.moodle_token else []
        requested = [name.strip() for name in settings.connector_plugins.split(",") if name.strip()]
        requested = sorted(ConnectorSelection(settings.local_dir).effective(set(requested)))
        for name in requested:
            if name in unavailable_plugins or any(item.name == name for item in connectors):
                continue
            try:
                plugin_settings = settings.model_copy(update={"connector_plugins": name})
                connectors.extend(load_connector_plugins(plugin_settings, include_saved_selection=False))
            except ConnectorPluginError as exc:
                log.warning("Optionales Connector-Plugin nicht verfügbar: %s", type(exc).__name__)
                unavailable_plugins.append(name)
    sync_engine = SyncEngine(factory, settings, connectors, notifier, coordinator)
    index_jobs = IndexJobs(factory, settings, coordinator)
    ocr_service = OCRService(OCRRepository(factory), settings)
    corpus_worker = CorpusWorker(CorpusRepository(factory, settings), coordinator)
    coding_service = CodingService(CodingRepository(factory), Judge0Backend(settings), coordinator)
    background_jobs = BackgroundJobs(JobRepository(factory), coordinator, job_handlers(factory, settings, coordinator, index_jobs, ocr_service, sync_engine, corpus_worker, coding_service))
    assessment_service = AssessmentService(AssessmentRepository(factory), coordinator)
    entity_actions = EntityActions(factory, settings, coordinator, index_jobs, coding_service, assessment_service)
    mail_service = MailService(settings, factory, coordinator)
    forwarding_service = MailForwardingService(settings, factory, coordinator)
    timetable_service = TimetableService(settings, factory, coordinator)
    scheduler = SyncScheduler(sync_engine, settings, coordinator, mail_service, timetable_service, forwarding_service)
    runtime_service = RuntimeService(RuntimeRepository(factory), settings, scheduler, coordinator)
    addon_service = AddonService(AddonRepository(settings.local_dir, factory))
    capability_service = CapabilityService(CapabilityRepository(factory), settings,
                                           unavailable_plugins, anki_available)
    write_gate = WriteGate()
    request_gate = WriteGate()
    action_journal = ActionJournal(settings)
    standby_monitor = StandbyMonitor(settings, coordinator, engine, scheduler, request_gate)

    async def assistant_failure(request: Request, exc: Exception):
        if not request.url.path.startswith(("/api/ai/mcp/", "/api/ai/connection")):
            return PlainTextResponse("Internal Server Error", status_code=500)
        frames = traceback.extract_tb(exc.__traceback__)[-3:]
        # Log locations and exception type only: never SQL parameters, source text or credentials.
        locations = ",".join(f"{frame.name}:{frame.lineno}" for frame in frames)
        log.error("AI_CONNECTION_FAILURE %s %s", type(exc).__name__, locations)
        if isinstance(exc, OperationalError):
            code = getattr(exc.orig, "sqlite_errorcode", 0)
            if code & 0xFF in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED}:
                return JSONResponse({"detail": "UniOS verarbeitet gerade Daten. Bitte gleich erneut versuchen.",
                                     "code": "AI_HOST_BUSY"}, status_code=503)
        return JSONResponse({"detail": "Lokale KI-Verbindung konnte die Anfrage nicht abschließen.",
                             "code": "AI_CONNECTION_FAILURE"}, status_code=500)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configure_logging(settings.local_dir, settings.secret_values)
        if start_scheduler and not settings.server_mode and settings.automatic_takeover_enabled and settings.host_health_url:
            lease = coordinator.current()
            if lease is not None and lease.released_at is None and lease.device_id != coordinator._device_id():
                try:
                    acquire_stale(settings)
                except HostLeaseError as exc:
                    log.info("Ausfallübernahme bleibt im Standby: %s", str(exc))
        coordinator.start()
        try:
            runtime_service.load()
        except (OperationalError, ValidationError) as exc:  # an older DB may lack the table
            log.warning("Laufzeiteinstellungen konnten nicht geladen werden: %s", type(exc).__name__)
        if start_scheduler and coordinator.is_writer:
            scheduler.scheduler.add_job(notification_center.refresh, "interval", minutes=15,
                                        id="notification-center", max_instances=1, coalesce=True)
            scheduler.start()
        if start_scheduler:
            if coordinator.is_writer:
                coding_service.repository.recover(coordinator.assert_writer)
                background_jobs.start()
                corpus_worker.start()
            index_jobs.start(discover=True)
        if start_scheduler and not settings.server_mode:
            standby_monitor.start()
        yield
        standby_monitor.stop()
        background_jobs.close()
        corpus_worker.close()
        index_jobs.close()
        if start_scheduler and scheduler.scheduler.running:
            scheduler.stop()
        if anki_available:
            from app.anki.collection import close_study_collection

            close_study_collection()
        engine.dispose()
        if owns_coordinator:
            coordinator.close()

    app = FastAPI(title="UniOS", version=version("unios"), lifespan=lifespan)
    corpus_cache = RetrievalCache()
    app.state.corpus_cache = corpus_cache

    @app.get('/api/recovery/status', response_model=RecoveryStatusView, response_model_exclude_unset=True)
    def recovery_status():
        return {'mode': 'demo' if settings.demo_mode else 'normal', 'background_work': start_scheduler}
    app.state.factory = factory
    app.state.sync_engine = sync_engine
    app.state.index_jobs = index_jobs
    app.state.background_jobs = background_jobs
    app.state.corpus_worker = corpus_worker
    app.state.assessment_service = assessment_service
    app.state.coding_service = coding_service
    app.state.host_coordinator = coordinator
    app.state.addon_service = addon_service
    app.state.write_gate = write_gate
    app.state.standby_monitor = standby_monitor
    # Static note subroutes must precede the generic /notes/{note_id} route.
    app.include_router(note_links_router(NoteLinkService(NoteLinkRepository(factory))))
    app.include_router(make_api_router(settings, factory, sync_engine, connectors, coordinator))
    app.include_router(proposal_router(factory, coordinator))
    app.include_router(material_router(settings, factory, coordinator))
    app.include_router(jobs_router(background_jobs))
    app.include_router(source_router(settings, factory, corpus_cache))
    app.include_router(corpus_status_router(settings, factory))
    app.include_router(assessment_router(assessment_service))
    app.include_router(coding_router(coding_service, background_jobs))
    app.include_router(ocr_router(ocr_service, coordinator))
    notification_center = NotificationCenter(factory, settings, coordinator)
    app.include_router(notification_router(notification_center))
    app.include_router(local_actions_router(LocalActions(factory, settings, coordinator)))
    app.include_router(links_router(factory, coordinator))
    app.include_router(entities_router(factory, entity_actions))
    app.include_router(journal_router(settings, factory, coordinator))
    app.include_router(trash_router(settings, factory, coordinator))
    app.include_router(backup_router(settings, coordinator))
    app.include_router(inbox_router(settings, factory, coordinator))
    app.include_router(intake_router(IntakeService(IntakeRepository(factory, settings)), coordinator))
    app.include_router(references_router(settings, factory, coordinator))
    app.include_router(peek_router(settings, factory))
    app.include_router(note_media_router(settings, coordinator))
    app.include_router(task_peek_router(PeekService(PeekRepository(factory))))
    app.include_router(assignment_router(factory, coordinator))
    app.include_router(course_router(factory, coordinator))
    app.include_router(enrolment_router(sync_engine.connectors, coordinator, sync_engine))
    app.include_router(collections_router(settings, factory, coordinator))
    app.include_router(metadata_router(factory, coordinator))
    app.include_router(rules_router(settings, factory, coordinator, notifier))
    app.include_router(runtime_router(runtime_service, coordinator))
    app.include_router(capability_router(capability_service))
    app.include_router(activity_router(ActivityService(ActivityRepository(factory))))
    app.include_router(voice_router(settings, factory, coordinator))
    app.include_router(drop_router(settings, factory, coordinator))
    app.include_router(export_router(settings))
    app.include_router(feedback_router(settings, factory, coordinator, connectors))
    app.include_router(release_health_router(ReleaseHealthService(
        ReleaseHealthRepository(Path(make_url(settings.database_url).database or ':memory:')))))
    app.include_router(digest_router(settings, factory, coordinator))
    app.include_router(card_queue_router(settings, factory, coordinator))
    if anki_router is not None:
        transfer_service = TransferService(settings, factory, coordinator)
        app.include_router(manual_router(settings, factory, coordinator, transfer_service))
        from app.anki.note_api import note_card_router

        app.include_router(note_card_router(settings, factory, coordinator, transfer_service))
        app.include_router(anki_router(settings, factory, coordinator,
                                       StudyService(StudyRepository(settings, factory)), transfer_service))
    app.include_router(ai_router(settings, factory, coordinator))
    app.include_router(exercise_router(factory, coordinator))
    app.include_router(practice_router(factory, coordinator))
    app.include_router(learning_router(settings, factory, coordinator))
    app.include_router(focus_router(FocusService(FocusRepository(factory, settings), settings)))
    app.include_router(cycles_router(CycleService(CycleRepository(factory), settings), coordinator))
    app.include_router(modules_router(ModuleService(ModuleRepository(factory), settings), coordinator))
    analytics_repository = AnalyticsRepository(factory)
    app.include_router(analytics_router(AnalyticsService(analytics_repository, settings),
                                        analytics_repository, coordinator))
    app.include_router(explanation_router(settings, factory, coordinator))
    app.add_exception_handler(Exception, assistant_failure)
    app.include_router(mcp_router(settings, factory, coordinator, entity_actions, corpus_cache))
    app.include_router(connection_router(McpConnection(settings), factory, coordinator))
    app.include_router(submission_router(settings, factory, coordinator))
    app.include_router(project_router(settings, factory, coordinator))
    app.include_router(grade_router(factory, coordinator))
    app.include_router(primuss_router(settings, factory, coordinator, sync_engine))
    app.include_router(mycampus_router(settings, factory, coordinator))
    campus_import_job = CampusImportJob()
    app.state.campus_import_job = campus_import_job
    app.include_router(campus_import_router(settings, factory, coordinator, campus_import_job))
    app.include_router(public_periods_router(settings, factory, coordinator))
    app.include_router(conflict_router(settings, coordinator))
    app.include_router(mail_router(factory, coordinator))
    app.include_router(mail_connection_router(mail_service))
    app.include_router(mail_forwarding_router(forwarding_service))
    app.include_router(timetable_router(timetable_service))
    app.include_router(mensa_router(settings))
    app.include_router(rooms_router(settings))
    app.include_router(setup_router(settings, sync_engine, coordinator, campus_import_job.login_saved))
    app.include_router(session_router(settings))
    app.include_router(connector_registry_router(settings, coordinator))
    app.include_router(addon_router(addon_service, coordinator))

    install_http_middleware(app, settings=settings, coordinator=coordinator, write_gate=write_gate,
                            request_gate=request_gate, action_journal=action_journal)

    @app.get("/api/host", response_model=HostView)
    def host_status():
        lease = coordinator.current()
        return {"mode": "released" if lease and lease.released_at else "host" if coordinator.is_writer else "standby",
                "device_name": lease.device_name if lease else None,
                "generation": lease.generation if lease else None,
                "heartbeat_at": lease.heartbeat_at if lease else None,
                "released_at": lease.released_at if lease else None,
                "topology": "server" if settings.server_mode else "local"}

    @app.post("/api/host/release", response_model=HostView)
    def release_host():
        if settings.server_mode:
            raise HTTPException(409, "Der feste UniOS-Server bleibt Host")
        try:
            release_running_host(coordinator, scheduler, write_gate,
                                 pre_release_check=lambda: require_syncthing_ready(settings))
        except WriteGateBusy as exc:
            raise HTTPException(409, str(exc)) from None
        except HostLeaseError as exc:
            raise HTTPException(409, str(exc)) from None
        except Exception as exc:  # noqa: BLE001 - API must not reveal database paths or secrets
            log.warning("Host-Übergabe fehlgeschlagen: %s", type(exc).__name__)
            raise HTTPException(503, "Host-Übergabe fehlgeschlagen; Daten und Snapshot prüfen") from None
        return host_status()

    @app.get("/health")
    def health():
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok"}

    @app.get("/files/{version_id}")
    def download_file(version_id: int):
        with factory() as session:
            version = session.get(ResourceVersion, version_id)
            if not version:
                raise HTTPException(status_code=404)
            path = resolve_local(settings.data_dir / version.relative_path)
            if not path.is_relative_to(resolve_local(settings.data_dir / "uni")) or not path.is_file():
                raise HTTPException(status_code=404)
            return FileResponse(path, media_type=version.mime_type, filename=path.name)

    @app.get("/files/{version_id}/view")
    def view_file(version_id: int):
        """A stored file for UniOS's own viewer: only listed formats, never anything a browser would run."""
        with factory() as session:
            version = session.get(ResourceVersion, version_id)
            if not version:
                raise HTTPException(status_code=404)
            path = resolve_local(settings.data_dir / version.relative_path)
            if not path.is_relative_to(resolve_local(settings.data_dir / "uni")) or not path.is_file():
                raise HTTPException(status_code=404)
            view = view_for(path.name)
            if view is None:
                raise HTTPException(status_code=415, detail="Diese Datei zeigt UniOS nicht selbst an")
            _, media_type = view
            if media_type == TEXT and path.stat().st_size > MAX_TEXT_BYTES:
                raise HTTPException(status_code=413, detail="Die Datei ist zu groß für die Anzeige")
            return FileResponse(path, media_type=media_type, content_disposition_type="inline", headers={
                "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline",
                # Opened on its own, the file may not run code or reach anything.
                "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; "
                                           "style-src 'unsafe-inline'; sandbox",
            })

    @app.get("/files/{version_id}/markdown")
    def markdown_file(version_id: int):
        with factory() as session:
            version = session.get(ResourceVersion, version_id)
            if not version:
                raise HTTPException(status_code=404)
            value = document_markdown(session, version_id)
            if not value:
                raise HTTPException(status_code=404, detail="Kein extrahierbarer Text vorhanden")
            return Response(value, media_type="text/markdown; charset=utf-8")

    @app.get("/calendar.ics")
    def calendar_feed(sources: str | None = None):
        selected = set(sources.split(',')) if sources is not None else None
        if sources is not None and (len(sources) > 150 or not selected or not selected <= EXPORT_SOURCES):
            raise HTTPException(400, 'Bitte gültige Kalenderquellen auswählen')
        with factory() as session:
            data = build_calendar(session, settings, selected)
        return Response(data, media_type="text/calendar; charset=utf-8",
                        headers={"Cache-Control": "private, no-store"})

    if settings.serve_react:
        if not (settings.react_dist_dir / "index.html").is_file():
            raise RuntimeError("React-Build fehlt: frontend/dist/index.html")
        app.mount("/", StaticFiles(directory=settings.react_dist_dir, html=True), name="react")

    return app
