# SPDX-License-Identifier: AGPL-3.0-or-later

import logging
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import unquote, urlsplit

from sqlalchemy import func, select

from app.config import Settings
from app.connectors.base import Connector, RemoteCourse, RemoteResource, Snapshot
from app.connectors.moodle.client import MoodleError, MoodleTokenError
from app.db.models import (
    Announcement,
    Assignment,
    CalendarEvent,
    Change,
    ConnectorHealth,
    Course,
    CourseSection,
    Deadline,
    Note,
    Resource,
    ResourceText,
    ResourceVersion,
    SectionGroupAssignment,
    Semester,
    SyncRun,
    utc_now,
)
from app.db.session import begin_write_transaction
from app.db.trash import INCLUDE_TRASHED
from app.deadline_proposals.service import stage_document_date
from app.extract.isolated import prepare_pages
from app.extract.service import ExtractedPage
from app.files.sidecars import (
    metadata_for,
    resource_state_for,
    write_file_state_sidecar,
    write_link_sidecar,
    write_sidecar,
)
from app.files.store import FileStore, content_type
from app.health.logging import redact_sensitive
from app.host.actions import ActionJournal
from app.host.lease import HostCoordinator
from app.notes.store import create_note
from app.notes.templates import TEMPLATE, lecture_title
from app.notify.links import dashboard_link_or_notice
from app.notify.service import Notifier
from app.portals.read_client import PortalLoginRequired, PortalReadError
from app.sync.groups import suggest_group_status
from app.timeutil import as_utc

log = logging.getLogger(__name__)


@dataclass
class PreparedResource:
    data: bytes | None = None
    digest: str | None = None
    pages: list[ExtractedPage] | None = None
    extraction_failed: bool = False


def from_timestamp(value: int | None) -> datetime | None:
    return datetime.fromtimestamp(value, UTC) if value else None


def snapshot_implausible(previous_courses: int | None, previous_resources: int | None,
                         found_courses: int, found_resources: int) -> bool:
    """A snapshot far smaller than the last one is more likely a broken fetch than real removals.

    Small counts (up to two) are not judged by ratio; vanishing files are always suspicious.
    """
    if found_courses == 0:
        return True
    if previous_courses is not None and previous_courses > 2 and found_courses < previous_courses / 2:
        return True
    if previous_resources is not None and previous_resources > 0:
        return found_resources == 0 or (previous_resources > 2 and found_resources < previous_resources / 2)
    return False


class SyncEngine:
    def __init__(self, factory, settings: Settings, connectors: list[Connector], notifier: Notifier,
                 coordinator: HostCoordinator):
        self.factory = factory
        self.settings = settings
        self.connectors = connectors
        self.notifier = notifier
        self.coordinator = coordinator
        self.store = FileStore(settings.data_dir)
        self._lock = threading.Lock()

    @property
    def running(self) -> bool:
        """Live process state; an abandoned database row is not an active sync."""
        return self._lock.locked()

    def run(self, *, record_action: bool = True, before_step=None) -> SyncRun | None:
        self.coordinator.assert_writer()
        if not self._lock.acquire(blocking=False):
            return None
        action_id: str | None = None
        completed = False
        try:
            if record_action:
                action_id = ActionJournal(self.settings).begin_operation(self.coordinator, "sync")
            with self.factory() as session:
                run = SyncRun(status="running")
                session.add(run)
                session.commit()
                run_id = run.id
            errors: list[str] = []
            warnings: list[str] = []
            for connector in self.connectors:
                if before_step is not None:
                    try:
                        before_step()
                    except Exception:
                        # Cancellation is observed between connectors. Publish
                        # only while this process still owns the host lease.
                        self.coordinator.assert_writer()
                        with self.factory() as session:
                            run = session.get(SyncRun, run_id)
                            run.status = "interrupted"
                            run.finished_at = utc_now()
                            run.error = "SYNC_INTERRUPTED"
                            session.commit()
                        raise
                try:
                    with self.factory() as session:
                        last_success = session.scalar(select(ConnectorHealth.last_success_at)
                                                      .where(ConnectorHealth.connector == connector.name))
                    if last_success is not None:
                        last_success = as_utc(last_success)
                    # One-second overlap covers Moodle's integer timestamps at the fetch boundary.
                    since = max(0, int(last_success.timestamp()) - 1) if last_success is not None else None
                    fetch_started_at = utc_now()
                    snapshot = connector.fetch_changes(since=since)
                    self.coordinator.assert_writer()
                    with self.factory() as session:
                        run = session.get(SyncRun, run_id)
                        skipped = self._process_snapshot(session, run, connector, snapshot, fetch_started_at)
                        session.commit()
                    if skipped:
                        warnings.append(f"{connector.name}: {skipped} Dateien konnten nicht gespeichert werden")
                    self._scaffold_lectures(connector.name)
                except Exception as exc:
                    # Ein Connector darf andere nicht blockieren. Kein Token in Log oder UI.
                    message = "Moodle-Token erneuern" if isinstance(exc, MoodleTokenError) else redact_sensitive(
                        f"{type(exc).__name__}: {str(exc)[:300]}", self.settings.secret_values)
                    log.error("Connector %s fehlgeschlagen: %s", connector.name, message, exc_info=exc)
                    errors.append(f"{connector.name}: {message}")
                    with self.factory() as session:
                        self._record_failure(session, connector.name, message)
                        if isinstance(exc, MoodleTokenError) and connector.name == "moodle":
                            self.notifier.enqueue(session, f"moodle-token:{utc_now():%Y-%m-%d}",
                                                  "Moodle neu verbinden",
                                                  f"Moodle braucht deine Aufmerksamkeit. {dashboard_link_or_notice(self.settings, '/system')}")
                        else:
                            self.notifier.enqueue(session, f"connector:{connector.name}:{utc_now():%Y-%m-%d}",
                                                  "Uni-Verbindung prüfen",
                                                  f"Eine Uni-Verbindung braucht deine Aufmerksamkeit. {dashboard_link_or_notice(self.settings, '/system')}")
                        session.commit()
            with self.factory() as session:
                run = session.get(SyncRun, run_id)
                run.finished_at = utc_now()
                run.status = "error" if errors else ("warning" if warnings or self._has_warning(session) else "success")
                run.error = "\n".join(errors or warnings) or None
                label = {"success": "erfolgreich", "warning": "mit Warnung", "error": "mit Fehler"}.get(run.status, run.status)
                session.add(Change(sync_run_id=run.id, kind="sync", summary=f"Sync {label}: {run.course_count} Kurse, {run.change_count} Änderungen"))
                session.commit()
            self.notifier.deliver_pending(self.factory)
            with self.factory() as session:
                result = session.get(SyncRun, run_id)
                completed = True
                return result
        finally:
            try:
                if action_id is not None:
                    ActionJournal(self.settings).finish(action_id, 200 if completed else 500)
            except OSError:
                log.warning("Aktionsprotokoll konnte Sync-Ergebnis nicht abschließen")
            finally:
                self._lock.release()

    def _has_warning(self, session) -> bool:
        return session.scalar(select(func.count()).select_from(ConnectorHealth).where(ConnectorHealth.status != "ok")) > 0

    def _scaffold_lectures(self, source: str) -> None:
        """Create missing drafts for clearly named lectures after a successful sync."""
        with self.factory() as session:
            # One query for every candidate resource instead of one ``session.get`` per id.
            candidates = [(resource.id, resource.course_id, lecture_title(resource.name,
                          file_hint=unquote(urlsplit(resource.url).path) if resource.kind == "file" else None))
                         for resource in session.scalars(select(Resource).where(
                             Resource.source == source, Resource.removed_upstream.is_(False),
                             Resource.group_category != "other_group",
                         )).all()]
        for resource_id, course_id, title in candidates:
            if not title:
                continue
            with self.factory() as session:
                # A note the user put in the trash counts too: deleting it must not
                # make the next sync bring the lecture note back.
                if session.scalar(select(Note.id).where(
                    (Note.resource_id == resource_id) |
                    ((Note.course_id == course_id) & (Note.title == title))
                ).execution_options(**INCLUDE_TRASHED)):
                    continue
                self.coordinator.assert_writer()
                create_note(session, self.settings, course_id=course_id,
                            resource_id=resource_id, title=title, body=TEMPLATE)

    def _record_failure(self, session, name: str, message: str) -> None:
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == name))
        if not health:
            health = ConnectorHealth(connector=name, consecutive_failures=0)
            session.add(health)
        health.last_attempt_at = utc_now()
        health.consecutive_failures += 1
        health.status = "error"
        health.message = message

    def _process_snapshot(self, session, run: SyncRun, connector: Connector, snapshot: Snapshot,
                          fetch_started_at: datetime) -> int:
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == connector.name))
        if not health:
            health = ConnectorHealth(connector=connector.name)
            session.add(health)
        previous_courses = health.course_count
        previous_resources = health.resource_count
        found_courses = len(snapshot.courses)
        found_resources = sum(len(course.resources) for course in snapshot.courses)
        implausible = snapshot_implausible(previous_courses, previous_resources, found_courses, found_resources)
        health.last_attempt_at = utc_now()
        health.consecutive_failures = 0
        health.status = "warning" if implausible or snapshot.warnings else "ok"
        health.message = "Plausibilitätswarnung: auffällig wenige Kurse/Ressourcen; nichts als entfernt markiert" if implausible else "; ".join(snapshot.warnings + snapshot.notices) or None
        if implausible:
            self.notifier.enqueue(session, f"plausibility:{connector.name}:{utc_now():%Y-%m-%d}",
                                  "Uni-Daten prüfen", f"Neue Uni-Daten sollten geprüft werden. {dashboard_link_or_notice(self.settings, '/system')}")
            return 0
        # A change arriving during the fetch must still be queried on the next run.
        health.course_count = found_courses
        health.resource_count = found_resources
        if snapshot.warnings:
            self.notifier.enqueue(session, f"connector-warning:{connector.name}:{utc_now():%Y-%m-%d}",
                                  "Uni-Verbindung prüfen",
                                  f"Eine Uni-Verbindung braucht deine Aufmerksamkeit. {dashboard_link_or_notice(self.settings, '/system')}")
        semester = self._current_semester(session)
        seen_keys: set[str] = set()
        seen_assignments: set[str] = set()
        new_files_count = 0
        skipped_files = 0
        for remote in snapshot.courses:
            course = self._upsert_course(session, connector.name, remote, semester)
            run.course_count += 1
            section_ids = self._upsert_sections(session, course, remote)
            for item in remote.resources:
                seen_keys.add(item.key)
                run.resource_count += 1
                section_assignment = section_ids.get(item.section_key) if item.section_key else None
                section_id, group_category = section_assignment if section_assignment else (None, "general")
                if group_category == "other_group" and not course.download_other_groups:
                    continue
                try:
                    # End metadata writes before any network or parser work.
                    self.coordinator.assert_writer()
                    session.commit()
                    prepared = self._prepare_resource(connector, item)
                    self.coordinator.assert_writer()
                    begin_write_transaction(session)
                    with session.begin_nested():
                        stored_new = self._upsert_resource(session, run, connector, course, section_id, group_category, item, prepared)
                    self.coordinator.assert_writer()
                    session.commit()
                except MoodleTokenError:
                    raise
                except (OSError, ValueError, MoodleError) as exc:
                    # One file that cannot be stored must not cost the user every other course and file.
                    log.warning("Datei übersprungen: %s", type(exc).__name__, exc_info=exc)
                    self._change(session, run, None, "sync_warning", f"Datei nicht gespeichert: {item.name}", course.id)
                    skipped_files += 1
                    continue
                if stored_new and group_category != "other_group":
                    new_files_count += 1
            self._upsert_assignments(session, run, connector.name, course, remote)
            seen_assignments.update(item.key for item in remote.assignments)
            self._upsert_announcements(session, connector.name, course, remote)
        self._upsert_events(session, connector.name, snapshot.events)
        # Entfernen nur nach vollständig plausibler Momentaufnahme.
        self._mark_removed_resources(session, run, connector.name, seen_keys)
        if snapshot.assignments_complete:
            self._mark_removed_assignments(session, run, connector.name, seen_assignments)
        if new_files_count:
            self.notifier.enqueue(session, f"new-files:{run.id}", "Neue Unterlagen",
                                  f"Neue Unterlagen sind da. {dashboard_link_or_notice(self.settings, '/activity')}")
        self.enqueue_deadline_notifications(session)
        health.last_success_at = fetch_started_at
        return skipped_files

    def _upsert_events(self, session, source: str, events) -> None:
        keys = [event.key for event in events]
        existing_by_key = {item.source_key: item for item in session.scalars(
            select(CalendarEvent).where(CalendarEvent.source == source, CalendarEvent.source_key.in_(keys))).all()} if keys else {}
        course_keys = {event.course_key for event in events if event.course_key}
        course_ids = {course.source_id: course.id for course in session.scalars(
            select(Course).where(Course.source == source, Course.source_id.in_(course_keys))).all()} if course_keys else {}
        for event in events:
            existing = existing_by_key.get(event.key)
            if not existing:
                existing = CalendarEvent(source=source, source_key=event.key, title=event.title,
                                         starts_at=from_timestamp(event.starts_timestamp))
                session.add(existing)
                existing_by_key[event.key] = existing
            existing.title = event.title
            existing.course_id = course_ids.get(event.course_key) if event.course_key else None
            existing.starts_at = from_timestamp(event.starts_timestamp)
            existing.ends_at = from_timestamp(event.ends_timestamp)
            existing.url = event.url

    def _mark_removed_resources(self, session, run: SyncRun, source: str, seen_keys: set[str]) -> None:
        for item in session.scalars(select(Resource).where(Resource.source == source, Resource.removed_upstream.is_(False))).all():
            if item.source_key in seen_keys:
                continue
            item.removed_upstream = True
            self.coordinator.assert_writer()
            state = resource_state_for(session, item, observed_at=utc_now())
            if item.kind == "link":
                write_link_sidecar(self.settings.data_dir, state)
            else:
                write_file_state_sidecar(self.settings.data_dir, state)
            self._change(session, run, item, "removed_upstream", f"Nicht mehr auf Moodle vorhanden: {item.name}")

    def _mark_removed_assignments(self, session, run: SyncRun, source: str, seen: set[str]) -> None:
        for assignment in session.scalars(select(Assignment).where(Assignment.source == source, Assignment.removed_upstream.is_(False))).all():
            if assignment.source_key in seen:
                continue
            assignment.removed_upstream = True
            deadline = session.scalar(select(Deadline).where(Deadline.source == source, Deadline.source_key == assignment.source_key))
            if deadline:
                deadline.removed_upstream = True
            self._change(session, run, None, "removed_upstream", f"Aufgabe nicht mehr auf Moodle: {assignment.title}",
                         assignment.course_id, assignment_id=assignment.id)

    def _current_semester(self, session) -> Semester:
        semester = session.scalar(select(Semester).where(Semester.is_current.is_(True)).order_by(Semester.id.desc()))
        if not semester:
            semester = Semester(name=self.settings.current_semester_name, is_current=True)
            session.add(semester)
            session.flush()
        return semester

    def _upsert_course(self, session, source: str, remote: RemoteCourse, semester: Semester) -> Course:
        course = session.scalar(select(Course).where(Course.source == source, Course.source_id == remote.key))
        if not course:
            course = Course(source=source, source_id=remote.key, name=remote.name, semester_id=semester.id)
            session.add(course)
            session.flush()
        course.name = remote.name
        course.short_name = remote.short_name
        course.last_seen_at = utc_now()
        return course

    def _upsert_sections(self, session, course: Course, remote: RemoteCourse) -> dict[str, tuple[int, str]]:
        result = {}
        for item in remote.sections:
            section = session.scalar(select(CourseSection).where(CourseSection.course_id == course.id, CourseSection.source_id == item.key))
            if not section:
                section = CourseSection(course_id=course.id, source_id=item.key, name=item.name)
                session.add(section)
                session.flush()
            section.name = item.name
            section.position = item.position
            hint = suggest_group_status(item.name, remote.own_group_names)
            assignment = session.scalar(select(SectionGroupAssignment).where(SectionGroupAssignment.section_id == section.id))
            if hint and assignment is None:
                assignment = SectionGroupAssignment(section_id=section.id, status=hint,
                                                    suggested_status=hint, needs_confirmation=True)
                session.add(assignment)
            elif assignment and assignment.needs_confirmation:
                assignment.suggested_status = hint
            result[item.key] = (section.id, assignment.status if assignment else "general")
        return result

    def _prepare_resource(self, connector: Connector, remote: RemoteResource) -> PreparedResource:
        if remote.kind == 'link':
            return PreparedResource()
        with self.factory() as session:
            resource = session.scalar(select(Resource).where(Resource.source == connector.name, Resource.source_key == remote.key))
            latest = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                                    .order_by(ResourceVersion.version.desc()).limit(1)) if resource else None
            if latest and not remote.force_check and self._version_exists(latest) and (
                    resource.url, resource.upstream_modified, resource.upstream_size) == (remote.url, remote.modified, remote.size):
                return PreparedResource()
            old_hash = latest.sha256 if latest else None
        self.coordinator.assert_writer()
        if remote.size is not None and remote.size > 512 * 1024 * 1024:
            raise ValueError('DOWNLOAD_SIZE_LIMIT')
        data = connector.download(remote)
        if len(data) > 512 * 1024 * 1024:
            raise ValueError('DOWNLOAD_SIZE_LIMIT')
        digest = FileStore.digest(data)
        if digest == old_hash:
            return PreparedResource(data=data, digest=digest)
        try:
            pages = prepare_pages(data, remote.filename or remote.name, content_type(data, remote.filename or remote.name),
                                  self.coordinator.assert_writer)
        except (OSError, ValueError):
            return PreparedResource(data=data, digest=digest, extraction_failed=True)
        return PreparedResource(data=data, digest=digest, pages=pages)

    def _upsert_resource(self, session, run: SyncRun, connector: Connector, course: Course, section_id: int | None,
                         group_category: str, remote: RemoteResource, prepared: PreparedResource) -> bool:
        resource = session.scalar(select(Resource).where(Resource.source == connector.name, Resource.source_key == remote.key))
        is_new = resource is None
        if is_new:
            resource = Resource(source=connector.name, source_key=remote.key, course_id=course.id, kind=remote.kind, name=remote.name, url=remote.url)
            session.add(resource)
            session.flush()
        was_removed = resource.removed_upstream
        old_metadata = (resource.name, resource.url, resource.section_id, resource.upstream_modified, resource.upstream_size)
        resource.course_id = course.id
        resource.section_id = section_id
        resource.group_category = group_category
        resource.name = remote.name
        resource.url = remote.url
        resource.upstream_modified = remote.modified
        resource.upstream_size = remote.size
        resource.last_seen_at = utc_now()
        resource.removed_upstream = False
        if was_removed and group_category != "other_group":
            self._change(session, run, resource, "restored", f"Wieder auf Moodle: {remote.name}")
        if remote.kind == "link":
            self.coordinator.assert_writer()
            write_link_sidecar(self.settings.data_dir, resource_state_for(session, resource))
            if is_new and group_category != "other_group":
                self._change(session, run, resource, "new", f"Neuer Link: {remote.name}")
            elif group_category != "other_group" and old_metadata != (resource.name, resource.url, resource.section_id, resource.upstream_modified, resource.upstream_size):
                self._change(session, run, resource, "metadata_changed", f"Link geändert: {remote.name}")
            return False
        latest = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id).order_by(ResourceVersion.version.desc()))
        metadata_changed = old_metadata != (resource.name, resource.url, resource.section_id, resource.upstream_modified, resource.upstream_size)
        file_metadata_changed = (old_metadata[1], old_metadata[3], old_metadata[4]) != (
            resource.url, resource.upstream_modified, resource.upstream_size)
        if latest and not file_metadata_changed and not remote.force_check and self._version_exists(latest):
            self.coordinator.assert_writer()
            write_file_state_sidecar(self.settings.data_dir, resource_state_for(session, resource))
            if metadata_changed and group_category != "other_group":
                self._change(session, run, resource, "metadata_changed", f"Metadaten geändert: {remote.name}")
            return False
        self.coordinator.assert_writer()
        data, digest = prepared.data, prepared.digest
        if data is None or digest is None:
            raise ValueError('Resource changed during preparation; retry sync')
        if latest and latest.sha256 == digest:
            if not self._version_exists(latest):
                raise FileNotFoundError("Gespeicherte Dateiversion fehlt; bitte Backup prüfen")
            write_file_state_sidecar(self.settings.data_dir, resource_state_for(session, resource))
            if metadata_changed and group_category != "other_group":
                self._change(session, run, resource, "metadata_changed", f"Metadaten geändert: {remote.name}")
            return False
        semester = session.get(Semester, course.semester_id)
        section = session.get(CourseSection, resource.section_id) if resource.section_id else None
        same_hash = session.scalar(select(ResourceVersion).where(ResourceVersion.sha256 == digest).limit(1))
        existing_path = self.settings.data_dir / same_hash.relative_path if same_hash and self._version_exists(same_hash) else None
        version_number = latest.version + 1 if latest else 1
        self.coordinator.assert_writer()
        relative_path = self.store.save(
            data, semester.name if semester else self.settings.current_semester_name, course.name,
            section.name if section else "Sonstiges", remote.filename or remote.name, version_number, digest, utc_now(),
            connector.name, remote.key, existing_path,
        )
        version = ResourceVersion(resource_id=resource.id, version=version_number, sha256=digest,
                                  relative_path=relative_path.as_posix(), size=len(data), mime_type=content_type(data, remote.filename or remote.name))
        session.add(version)
        session.flush()
        write_sidecar(self.settings.data_dir, metadata_for(session, resource, version))
        write_file_state_sidecar(self.settings.data_dir, resource_state_for(session, resource))
        if prepared.extraction_failed:
            if group_category != "other_group":
                self._change(session, run, resource, "extraction_error", f"Textextraktion fehlgeschlagen: {remote.name}")
        else:
            for page in prepared.pages or []:
                session.add(ResourceText(version_id=version.id, page_number=page.number, text=page.text,
                                         markdown=page.markdown, no_text_layer=page.no_text_layer))
            session.flush()
            if group_category != "other_group":
                stage_document_date(session, resource, version)
        if group_category != "other_group":
            self._change(session, run, resource, "new" if latest is None else "updated", f"{'Neue Datei' if latest is None else 'Datei aktualisiert'}: {remote.name} (v{version_number})")
        return latest is None

    def ingest_documents(self, connector: Connector, collections: list[RemoteCourse]) -> tuple[int, int]:
        """Store the files of course-like collections that do not come from a full sync.

        Used for documents a portal offers outside any course (for example a study programme's
        forms and module handbooks). They get the same versioning, sidecars and search index as
        Moodle files, but no removal logic and no sync run: a partial read must never mark
        anything as gone or count as a completed sync. Returns (stored, skipped).
        """
        self.coordinator.assert_writer()
        stored = skipped = 0
        run = SyncRun(status="ingest", course_count=0, resource_count=0, change_count=0)  # never saved
        with self.factory() as session:
            semester = self._current_semester(session)
            for remote in collections:
                course = self._upsert_course(session, connector.name, remote, semester)
                section_ids = self._upsert_sections(session, course, remote)
                for item in remote.resources:
                    section_id, group_category = section_ids.get(item.section_key or "", (None, "general"))
                    try:
                        self.coordinator.assert_writer()
                        session.commit()
                        prepared = self._prepare_resource(connector, item)
                        self.coordinator.assert_writer()
                        begin_write_transaction(session)
                        with session.begin_nested():
                            stored_new = self._upsert_resource(session, run, connector, course, section_id,
                                                               group_category, item, prepared)
                        self.coordinator.assert_writer()
                        session.commit()
                    except PortalLoginRequired:
                        raise
                    except (OSError, ValueError, MoodleError, PortalReadError) as exc:
                        log.warning("Dokument übersprungen: %s", type(exc).__name__, exc_info=exc)
                        skipped += 1
                        continue
                    stored += 1 if stored_new else 0
            session.commit()
        return stored, skipped

    def _version_exists(self, version: ResourceVersion) -> bool:
        return (self.settings.data_dir / version.relative_path).is_file()

    def _upsert_assignments(self, session, run: SyncRun, source: str, course: Course, remote: RemoteCourse) -> None:
        for item in remote.assignments:
            assignment = session.scalar(select(Assignment).where(Assignment.source == source, Assignment.source_key == item.key))
            is_new = assignment is None
            if is_new:
                assignment = Assignment(source=source, source_key=item.key, course_id=course.id, title=item.title)
                session.add(assignment)
                session.flush()
            assignment.title = item.title
            if assignment.removed_upstream:
                self._change(session, run, None, "restored", f"Aufgabe wieder auf Moodle: {item.title}",
                             course.id, assignment_id=assignment.id)
            assignment.removed_upstream = False
            from app.sync.assignment_context import assignment_context

            context = assignment_context(item.description, item.opens_timestamp, self.settings.timezone)
            assignment.description = item.description
            assignment.due_note = context.quote
            if not assignment.due_override:
                assignment.delivery = context.delivery
                assignment.due_at = from_timestamp(item.due_timestamp) or context.due_at
                assignment.due_origin = "moodle" if item.due_timestamp else "text" if context.due_at else "unknown"
            assignment.url = item.url
            assignment.last_seen_at = utc_now()
            if is_new:
                self._change(session, run, None, "assignment", f"Neue Aufgabe: {item.title}",
                             course.id, assignment_id=assignment.id)
                self.notifier.enqueue(session, f"assignment:{source}:{item.key}", "Neue Aufgabe",
                                      f"Eine neue Aufgabe ist da. {dashboard_link_or_notice(self.settings, '/deadlines')}", course_id=course.id)
            if assignment.due_at:
                deadline = session.scalar(select(Deadline).where(Deadline.source == source, Deadline.source_key == item.key))
                if not deadline:
                    deadline = Deadline(source=source, source_key=item.key, title=item.title, due_at=assignment.due_at)
                    session.add(deadline)
                deadline.course_id = course.id
                deadline.assignment_id = assignment.id
                deadline.title = item.title
                deadline.due_at = assignment.due_at
                deadline.url = item.url
                deadline.removed_upstream = False
            else:
                deadline = session.scalar(select(Deadline).where(Deadline.source == source, Deadline.source_key == item.key))
                if deadline:
                    deadline.removed_upstream = True

    def _upsert_announcements(self, session, source: str, course: Course, remote: RemoteCourse) -> None:
        for item in remote.announcements:
            announcement = session.scalar(select(Announcement).where(Announcement.source == source, Announcement.source_key == item.key))
            if not announcement:
                announcement = Announcement(source=source, source_key=item.key, course_id=course.id, title=item.title)
                session.add(announcement)
            announcement.title = item.title
            announcement.body = item.body
            announcement.url = item.url
            announcement.created_at = from_timestamp(item.created_timestamp)

    def enqueue_deadline_notifications(self, session) -> None:
        today = datetime.now(self.settings.timezone).date()
        for deadline in session.scalars(select(Deadline).where(Deadline.removed_upstream.is_(False))).all():
            due_at = as_utc(deadline.due_at)
            remaining = (due_at.astimezone(self.settings.timezone).date() - today).days
            if remaining in self.settings.warning_days:
                self.notifier.enqueue(session, f"deadline:{deadline.id}:{remaining}:{today}",
                                      "Frist nähert sich",
                                      f"Eine Frist nähert sich. {dashboard_link_or_notice(self.settings, '/deadlines')}")

    @staticmethod
    def _change(session, run: SyncRun, resource: Resource | None, kind: str, summary: str,
                course_id: int | None = None, *, assignment_id: int | None = None) -> None:
        session.add(Change(sync_run_id=run.id, resource_id=resource.id if resource else None,
                           assignment_id=assignment_id, course_id=course_id or (resource.course_id if resource else None),
                           kind=kind, summary=summary))
        run.change_count += 1
