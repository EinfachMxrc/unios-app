# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only checks and an explicitly confirmed, opt-in Moodle file submission."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update

from app.config import Settings
from app.connectors.moodle.client import MoodleClient, MoodleError, MoodleTokenError
from app.db.models import (
    Assignment,
    Course,
    Semester,
    SubmissionAttempt,
    SubmissionControl,
)
from app.host.lease import HostCoordinator
from app.submissions.service import (
    SubmissionCheck,
    archive_submission,
    latest_check,
    parse_submission,
    save_check,
)
from app.submissions.write_service import (
    MAX_FILE_BYTES,
    MAX_FILES,
    SubmissionFlowError,
    assignment_source_id,
    fetch_preflight,
    load_prepared,
    revision,
    store_prepared,
    upload_and_save,
    validate_files,
    verify_remote_files,
)

log = logging.getLogger(__name__)


class SubmissionControlChange(BaseModel):
    enabled: bool


class SubmissionConfirmation(BaseModel):
    attempt_id: str
    confirmed: bool
    accept_statement: bool = False
    replace_existing: bool = False


class SubmissionAttemptFile(BaseModel):
    name: str
    size: int
    sha256: str


class SubmissionAttemptView(BaseModel):
    id: str
    assignment_id: int
    assignment_name: str
    assignment_url: str | None
    course_name: str
    state: str
    files: list[SubmissionAttemptFile]
    existing_status: str
    final_submit: bool
    will_be_submitted: bool
    statement_required: bool
    statement_text: str | None
    due_at: datetime | None
    cutoff_at: datetime | None
    prepared_at: datetime
    expires_at: datetime
    result_status: str | None
    warning: str | None


def _attempt_view(attempt: SubmissionAttempt, assignment: Assignment, course: Course) -> dict:
    created = attempt.created_at.replace(tzinfo=UTC)
    return {
        "id": attempt.id, "assignment_id": assignment.id, "assignment_name": assignment.title,
        "assignment_url": assignment.url, "course_name": course.name,
        "state": attempt.state, "files": attempt.files, "existing_status": attempt.existing_status,
        "final_submit": attempt.final_submit,
        "will_be_submitted": attempt.final_submit or not attempt.requires_final_submit,
        "statement_required": attempt.statement_required,
        "statement_text": attempt.statement_text, "due_at": attempt.due_at,
        "cutoff_at": attempt.cutoff_at, "prepared_at": created,
        "expires_at": created + timedelta(minutes=30), "result_status": attempt.result_status,
        "warning": attempt.warning,
    }


def submission_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/submissions")

    def assignment_for(session, assignment_id: int) -> tuple[Assignment, Course]:
        assignment = session.get(Assignment, assignment_id)
        if assignment is None or assignment.source != "moodle" or assignment.removed_upstream:
            raise HTTPException(404, "Moodle-Aufgabe nicht gefunden")
        course = session.get(Course, assignment.course_id)
        if course is None or course.source != "moodle":
            raise HTTPException(404, "Moodle-Kurs nicht gefunden")
        return assignment, course

    def write_enabled(session) -> bool:
        control = session.get(SubmissionControl, 1)
        return bool(control and control.enabled)

    @router.get("/control")
    def submission_control():
        with factory() as session:
            return {"enabled": write_enabled(session)}

    @router.put("/control")
    def change_submission_control(payload: SubmissionControlChange):
        coordinator.assert_writer()
        with factory() as session:
            control = session.get(SubmissionControl, 1)
            if control is None:
                session.add(SubmissionControl(id=1, enabled=payload.enabled))
            else:
                control.enabled = payload.enabled
            session.commit()
        return {"enabled": payload.enabled}

    @router.get("/{assignment_id}/attempts/latest", response_model=SubmissionAttemptView | None)
    def latest_attempt(assignment_id: int, response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        with factory() as session:
            assignment, course = assignment_for(session, assignment_id)
            attempt = session.scalar(select(SubmissionAttempt).where(SubmissionAttempt.assignment_id == assignment_id)
                                     .order_by(SubmissionAttempt.created_at.desc()).limit(1))
            return _attempt_view(attempt, assignment, course) if attempt is not None else None

    @router.post("/{assignment_id}/prepare", response_model=SubmissionAttemptView)
    async def prepare(assignment_id: int, files: Annotated[list[UploadFile], File()],
                      final_submit: Annotated[bool, Form()] = False):
        coordinator.assert_writer()
        with factory() as session:
            if not write_enabled(session):
                raise HTTPException(403, "Abgabe über die App ist ausgeschaltet")
            assignment, course = assignment_for(session, assignment_id)
            if not settings.moodle_enabled or not settings.moodle_token or not settings.moodle_base_url:
                raise HTTPException(503, "Moodle ist nicht eingerichtet")
            if not files or len(files) > MAX_FILES:
                raise HTTPException(422, f"Bitte 1 bis {MAX_FILES} Dateien wählen")
            client = MoodleClient(settings)
            try:
                preflight = fetch_preflight(client, assignment, course.source_id)
                if final_submit and not preflight.requires_final_submit:
                    raise SubmissionFlowError("Für diese Aufgabe gibt es keinen zusätzlichen Einreichen-Schritt")
                if preflight.statement_required and not preflight.requires_final_submit:
                    raise SubmissionFlowError("Eigenständigkeitserklärung bitte direkt in Moodle bestätigen")
                selected = []
                for file in files:
                    content = await file.read(MAX_FILE_BYTES + 1)
                    selected.append((file.filename or "", content))
                records = validate_files(selected, preflight)
                attempt_id = uuid4().hex
                store_prepared(settings, attempt_id, selected, records)
                attempt = SubmissionAttempt(
                    id=attempt_id, assignment_id=assignment_id, state="prepared", files=records,
                    existing_status=preflight.check.status,
                    existing_revision=revision(preflight.check, preflight.submission),
                    final_submit=final_submit, requires_final_submit=preflight.requires_final_submit,
                    statement_required=preflight.statement_required and final_submit,
                    statement_text=preflight.statement_text if final_submit else None,
                    due_at=preflight.check.due_at, cutoff_at=preflight.check.cutoff_at,
                    created_at=datetime.now(UTC),
                )
                session.add(attempt)
                session.commit()
                return _attempt_view(attempt, assignment, course)
            except SubmissionFlowError as exc:
                raise HTTPException(422, str(exc)) from exc
            except MoodleError as exc:
                raise HTTPException(503, "Moodle-Vorabprüfung fehlgeschlagen; bitte direkt in Moodle prüfen") from exc
            finally:
                client.client.close()

    @router.post("/{assignment_id}/confirm", response_model=SubmissionAttemptView)
    def confirm(assignment_id: int, payload: SubmissionConfirmation):
        coordinator.assert_writer()
        with factory() as session:
            if not write_enabled(session):
                raise HTTPException(403, "Abgabe über die App ist ausgeschaltet")
            assignment, course = assignment_for(session, assignment_id)
            attempt = session.get(SubmissionAttempt, payload.attempt_id)
            if attempt is None or attempt.assignment_id != assignment_id:
                raise HTTPException(404, "Vorbereitete Abgabe nicht gefunden")
            if attempt.state != "prepared":
                raise HTTPException(409, "Dieser Abgabeversuch wurde bereits verwendet")
            created = attempt.created_at.replace(tzinfo=UTC)
            if datetime.now(UTC) - created > timedelta(minutes=30):
                raise HTTPException(409, "Vorbereitung ist abgelaufen; Dateien erneut wählen")
            if not payload.confirmed:
                raise HTTPException(422, "Abgabe muss ausdrücklich bestätigt werden")
            if attempt.statement_required and not payload.accept_statement:
                raise HTTPException(422, "Eigenständigkeitserklärung selbst bestätigen")
            if attempt.existing_status in {"draft", "submitted"} and not payload.replace_existing:
                raise HTTPException(422, "Bestehende Abgabe: Ersetzen gesondert bestätigen")
            claimed = session.execute(
                update(SubmissionAttempt)
                .where(SubmissionAttempt.id == attempt.id, SubmissionAttempt.state == "prepared")
                .values(state="started", started_at=datetime.now(UTC))
            )
            if claimed.rowcount != 1:
                session.rollback()
                raise HTTPException(409, "Dieser Abgabeversuch wurde bereits verwendet")
            session.commit()
            remote_started = False
            client = None
            try:
                client = MoodleClient(settings)
                selected = load_prepared(settings, attempt.id, attempt.files)
                preflight = fetch_preflight(client, assignment, course.source_id)
                if revision(preflight.check, preflight.submission) != attempt.existing_revision:
                    raise SubmissionFlowError("Moodle-Abgabestatus hat sich geändert; bitte neu vorbereiten")
                if attempt.requires_final_submit != preflight.requires_final_submit:
                    raise SubmissionFlowError("Moodle-Einreichungsregeln haben sich geändert")
                if attempt.statement_required != (preflight.statement_required and attempt.final_submit):
                    raise SubmissionFlowError("Moodle-Eigenständigkeitserklärung hat sich geändert")
                validate_files(selected, preflight)
                remote_started = True
                upload_and_save(client, assignment, selected, attempt.final_submit, payload.accept_statement)
                refreshed = client.call("mod_assign_get_submission_status",
                                        assignid=assignment_source_id(assignment))
                check_result, submission = parse_submission(assignment, refreshed, preflight.metadata)
                expected_status = "submitted" if attempt.final_submit or not attempt.requires_final_submit else "draft"
                if check_result.status != expected_status:
                    raise SubmissionFlowError("Moodle meldet nach der Abgabe keinen eindeutigen Erfolg")
                verify_remote_files(client, submission, attempt.files)
                semester = session.get(Semester, course.semester_id) if course.semester_id else None
                if check_result.status == "submitted":
                    archived = archive_submission(
                        settings, client, assignment, course, semester, submission, "submitted",
                        expected={str(file["name"]): str(file["sha256"]) for file in attempt.files})
                    check_result.archive_files = archived.file_count
                    check_result.timestamp_status = archived.timestamp_status
                save_check(settings, check_result)
                attempt.state = "completed"
                attempt.result_status = check_result.status
            except Exception as exc:  # noqa: BLE001 - after an external write, any failure must be recorded as uncertain
                attempt.state = "unclear" if remote_started else "failed"
                attempt.warning = ("Moodle-Abgabe möglicherweise erfolgt. Bitte direkt in Moodle prüfen; "
                                   "diesen Versuch nicht erneut senden." if remote_started else
                                   "Vorabprüfung fehlgeschlagen; bitte neue Abgabe vorbereiten oder Moodle öffnen.")
                log.warning("Abgabeversuch %s gestoppt: %s", attempt.id, type(exc).__name__)
            finally:
                if client is not None:
                    client.client.close()
                attempt.finished_at = datetime.now(UTC)
                session.commit()
            return _attempt_view(attempt, assignment, course)

    @router.get("/{assignment_id}", response_model=SubmissionCheck | None)
    def latest(assignment_id: int, response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        with factory() as session:
            assignment_for(session, assignment_id)
        return latest_check(settings, assignment_id)

    @router.post("/{assignment_id}/check", response_model=SubmissionCheck)
    def check(assignment_id: int, response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        coordinator.assert_writer()
        with factory() as session:
            assignment, course = assignment_for(session, assignment_id)
            semester = session.get(Semester, course.semester_id) if course.semester_id else None
            if not settings.moodle_enabled or not settings.moodle_token or not settings.moodle_base_url:
                raise HTTPException(503, "Moodle ist nicht eingerichtet")
            try:
                source_id = int(assignment.source_key.rsplit(":", 1)[-1])
            except ValueError:
                raise HTTPException(422, "Moodle-Aufgabenkennung ist ungültig") from None
            client = MoodleClient(settings)
            try:
                auth = client.check_auth()
                if "mod_assign_get_submission_status" not in auth.capabilities:
                    raise HTTPException(503, "Moodle bietet den Abgabestatus für diesen Zugang nicht an")
                payload = client.call("mod_assign_get_submission_status", assignid=source_id)
                metadata = None
                if "mod_assign_get_assignments" in auth.capabilities:
                    listing = client.call("mod_assign_get_assignments", **{"courseids[0]": course.source_id})
                    groups = listing.get("courses") if isinstance(listing, dict) else None
                    for group in groups if isinstance(groups, list) else []:
                        if not isinstance(group, dict):
                            continue
                        if str(group.get("id")) == course.source_id:
                            items = group.get("assignments")
                            metadata = next((item for item in items if isinstance(item, dict)
                                             and str(item.get("id")) == str(source_id)), None) if isinstance(items, list) else None
                            break
                check_result, submission = parse_submission(assignment, payload, metadata)
                if check_result.status in {"submitted", "graded"}:
                    try:
                        archived = archive_submission(
                            settings, client, assignment, course, semester, submission, check_result.status)
                        check_result.archive_files = archived.file_count
                        check_result.timestamp_status = archived.timestamp_status
                    except (MoodleError, OSError, ValueError) as exc:
                        log.warning("Abgabe-Archiv fehlgeschlagen: %s", type(exc).__name__)
                        check_result.warning = "Abgabe erkannt, Archiv unvollständig – bitte erneut prüfen"
                save_check(settings, check_result)
                return check_result
            except MoodleTokenError:
                raise HTTPException(503, "Moodle-Token erneuern") from None
            except MoodleError:
                raise HTTPException(503, "Moodle-Abgabestatus konnte nicht geprüft werden") from None
            finally:
                client.client.close()

    return router
