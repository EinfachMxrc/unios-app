# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative Moodle status parsing and immutable submission archives."""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any, Literal, NamedTuple

from pydantic import BaseModel

from app.config import Settings
from app.connectors.base import RemoteResource
from app.connectors.moodle.client import MoodleClient, MoodleError
from app.db.models import Assignment, Course, Semester
from app.files.atomic import ensure_directory, write_once
from app.files.sidecars import safe_external_url
from app.files.store import safe_name
from app.submissions.timestamp import timestamp_manifest

MAX_ARCHIVE_BYTES = 100_000_000


class SubmissionCheck(BaseModel):
    assignment_id: int
    checked_at: datetime
    status: Literal["none", "draft", "submitted", "graded", "unclear"]
    due_at: datetime | None = None
    cutoff_at: datetime | None = None
    extension_at: datetime | None = None
    requires_final_submit: bool | None = None
    group_members_pending: int | None = None
    grade: str | None = None
    feedback: str | None = None
    archive_files: int | None = None
    timestamp_status: dict[str, str] | None = None
    warning: str | None = None


def _timestamp(value: object) -> datetime | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return None
    try:
        return datetime.fromtimestamp(value, UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _dictionary(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _feedback_text(feedback: dict[str, Any]) -> str | None:
    plugins = feedback.get("plugins")
    for plugin in plugins if isinstance(plugins, list) else []:
        if not isinstance(plugin, dict) or plugin.get("type") not in {"comments", "feedbackcomments"}:
            continue
        fields = plugin.get("editorfields")
        for field in fields if isinstance(fields, list) else []:
            if isinstance(field, dict) and isinstance(field.get("text"), str):
                return field["text"][:5000]
    return None


def parse_submission(assignment: Assignment, payload: object,
                     metadata: dict[str, Any] | None = None) -> tuple[SubmissionCheck, dict[str, Any]]:
    checked_at = datetime.now(UTC)
    data = _dictionary(payload)
    attempt = _dictionary(data.get("lastattempt") or data.get("status"))
    submission = _dictionary(attempt.get("submission"))
    raw_status = submission.get("status")
    status: Literal["none", "draft", "submitted", "graded", "unclear"]
    if data.get("warnings") or (raw_status is not None and
                                (not isinstance(raw_status, str) or raw_status not in {"new", "draft", "submitted"})):
        status = "unclear"
    elif raw_status == "submitted":
        status = "graded" if attempt.get("graded") is True else "submitted"
    elif raw_status == "draft":
        status = "draft"
    elif attempt:
        status = "none"
    else:
        status = "unclear"
    details = metadata or {}
    due_at = _timestamp(details.get("duedate")) or assignment.due_at
    extension = _timestamp(attempt.get("extensionduedate"))
    feedback = _dictionary(data.get("feedback"))
    members = attempt.get("submissiongroupmemberswhoneedtosubmit")
    group_pending = len(members) if isinstance(members, list) else None
    final_required = details.get("submissiondrafts") if isinstance(details.get("submissiondrafts"), bool) else None
    warning = None
    if status == "unclear":
        warning = "Moodle-Status unklar – bitte direkt in Moodle prüfen"
    elif status == "draft" and final_required:
        warning = "Nur Entwurf: finales Einreichen in Moodle prüfen"
    return SubmissionCheck(
        assignment_id=assignment.id, checked_at=checked_at, status=status,
        due_at=extension or due_at, cutoff_at=_timestamp(details.get("cutoffdate")),
        extension_at=extension, requires_final_submit=final_required,
        group_members_pending=group_pending,
        grade=str(feedback.get("gradefordisplay"))[:500] if feedback.get("gradefordisplay") else None,
        feedback=_feedback_text(feedback), warning=warning,
    ), submission


def _submission_files(submission: dict[str, Any]) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    plugins = submission.get("plugins", [])
    if not isinstance(plugins, list):
        raise MoodleError("Moodle liefert eine unvollständige Abgabedateiliste")
    for plugin in plugins:
        if not isinstance(plugin, dict) or plugin.get("type") != "file":
            continue
        areas = plugin.get("fileareas")
        if not isinstance(areas, list):
            raise MoodleError("Moodle liefert eine unvollständige Abgabedateiliste")
        for area in areas:
            if not isinstance(area, dict) or not isinstance(area.get("files"), list):
                raise MoodleError("Moodle liefert eine unvollständige Abgabedateiliste")
            if not all(isinstance(item, dict) for item in area["files"]):
                raise MoodleError("Moodle liefert eine unvollständige Abgabedateiliste")
            files.extend(area["files"])
    return files


class ArchiveResult(NamedTuple):
    file_count: int
    timestamp_status: dict[str, str] | None


def archive_submission(settings: Settings, client: MoodleClient, assignment: Assignment,
                       course: Course, semester: Semester | None,
                       submission: dict[str, Any], status: Literal["submitted", "graded"],
                       expected: dict[str, str] | None = None) -> ArchiveResult:
    """Archive a submitted attempt after every file is downloaded and verified."""
    files = _submission_files(submission)
    if len(files) > 100:
        raise MoodleError("Abgabe enthält zu viele Dateien für das Archiv")
    downloaded: list[tuple[str, bytes, str]] = []
    total = 0
    for index, item in enumerate(files, 1):
        name = item.get("filename")
        url = item.get("fileurl")
        size = item.get("filesize")
        if (not isinstance(name, str) or not name or not isinstance(url, str)
                or not isinstance(size, int) or size < 0 or size > MAX_ARCHIVE_BYTES):
            raise MoodleError("Moodle liefert unvollständige Abgabedateien")
        clean_url = safe_external_url(url)
        if clean_url is None:
            raise MoodleError("Moodle liefert eine unsichere Abgabedatei-URL")
        total += size
        if total > MAX_ARCHIVE_BYTES:
            raise MoodleError("Abgabe ist größer als 100 MB")
        data = client.download(RemoteResource(
            f"submission:{assignment.id}:{index}", name, clean_url, "file", size=size))
        digest = hashlib.sha256(data).hexdigest()
        if expected is not None and expected.get(name) != digest:
            raise MoodleError("Archivdatei stimmt nicht mit der bestätigten Auswahl überein")
        downloaded.append((f"{index:03d}-{safe_name(name)}", data, digest))
    submitted_at = _timestamp(submission.get("timemodified"))
    if submitted_at is None:
        raise MoodleError("Moodle liefert keinen Einreichungszeitpunkt")
    submission_id = submission.get("id")
    if isinstance(submission_id, bool) or not isinstance(submission_id, int):
        raise MoodleError("Moodle liefert keine gültige Einreichungskennung")
    manifest = {
        "assignment_id": assignment.id,
        "submission_id": submission_id,
        "status": status,
        "submitted_at": submitted_at.isoformat(),
        "files": [{"name": name, "size": len(data), "sha256": digest}
                  for name, data, digest in downloaded],
    }
    fingerprint = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    folder = ensure_directory(settings.data_dir, "uni", safe_name(semester.name if semester else "Ohne_Semester", 40),
                              safe_name(course.name, 40), "_Abgaben", safe_name(f"{assignment.title}_{assignment.id}", 45),
                              f"{submitted_at:%Y%m%dT%H%M%SZ}-{fingerprint}")
    for name, data, _digest in downloaded:
        write_once(folder / name, data)
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    write_once(folder / "manifest.json", manifest_bytes)
    timestamp_status = None
    if settings.submission_tsa_url:
        timestamp_status = timestamp_manifest(settings, folder, manifest_bytes)
        write_once(folder / "timestamp.json", json.dumps(timestamp_status, ensure_ascii=False, indent=2).encode("utf-8"))
    return ArchiveResult(len(downloaded), timestamp_status)


def save_check(settings: Settings, check: SubmissionCheck) -> None:
    folder = ensure_directory(settings.data_dir, "submissions", str(check.assignment_id))
    leaf = f"check-{check.checked_at:%Y%m%dT%H%M%S%fZ}.json"
    write_once(folder / leaf, check.model_dump_json(indent=2).encode("utf-8"))


def latest_check(settings: Settings, assignment_id: int) -> SubmissionCheck | None:
    folder = settings.data_dir / "submissions" / str(assignment_id)
    if folder.is_symlink() or not folder.is_dir():
        return None
    paths = sorted(path for path in folder.glob("check-*.json") if path.is_file() and not path.is_symlink())
    return SubmissionCheck.model_validate_json(paths[-1].read_bytes()) if paths else None
