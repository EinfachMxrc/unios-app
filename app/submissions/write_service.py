# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative preflight and verification for explicit Moodle file submissions."""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import Settings
from app.connectors.base import RemoteResource
from app.connectors.moodle.client import MoodleClient
from app.db.models import Assignment
from app.files.atomic import ensure_directory, write_once
from app.files.sidecars import safe_external_url
from app.files.store import safe_name
from app.submissions.service import SubmissionCheck, _submission_files, parse_submission

MAX_FILE_BYTES = 30_000_000
MAX_TOTAL_BYTES = 100_000_000
MAX_FILES = 20


class SubmissionFlowError(RuntimeError):
    """A submission cannot safely continue with the information available."""


@dataclass(frozen=True)
class Preflight:
    check: SubmissionCheck
    submission: dict[str, Any]
    metadata: dict[str, Any]
    maximum_files: int
    maximum_bytes: int
    extensions: frozenset[str] | None
    requires_final_submit: bool
    statement_required: bool
    statement_text: str | None


def assignment_source_id(assignment: Assignment) -> int:
    try:
        source_id = int(assignment.source_key.rsplit(":", 1)[-1])
    except ValueError:
        raise SubmissionFlowError("Moodle-Aufgabenkennung ist ungültig") from None
    if source_id < 1:
        raise SubmissionFlowError("Moodle-Aufgabenkennung ist ungültig")
    return source_id


def _switch(value: object) -> bool | None:
    if value in (True, 1, "1"):
        return True
    if value in (False, 0, "0"):
        return False
    return None


def _config(metadata: dict[str, Any]) -> dict[str, str]:
    values: dict[str, str] = {}
    configs = metadata.get("configs")
    if not isinstance(configs, list):
        raise SubmissionFlowError("Moodle-Dateivorgaben fehlen; bitte direkt in Moodle abgeben")
    for config in configs:
        if (isinstance(config, dict) and config.get("plugin") == "file"
                and config.get("subtype") == "assignsubmission"
                and isinstance(config.get("name"), str)
                and isinstance(config.get("value"), (str, int))):
            values[config["name"]] = str(config["value"])
    return values


def _file_rules(metadata: dict[str, Any]) -> tuple[int, int, frozenset[str] | None]:
    config = _config(metadata)
    if _switch(config.get("enabled")) is not True:
        raise SubmissionFlowError("Diese Moodle-Aufgabe nimmt keine Dateiabgabe an")
    try:
        maximum_files = int(config["maxfilesubmissions"])
        maximum_bytes = int(config["maxsubmissionsizebytes"])
        filetypes = config["filetypeslist"].strip()
    except (KeyError, ValueError):
        raise SubmissionFlowError("Moodle-Dateivorgaben sind unvollständig") from None
    if maximum_files < 1 or maximum_bytes < 1:
        raise SubmissionFlowError("Moodle-Dateivorgaben sind ungültig")
    extensions = None
    if filetypes:
        listed = [item.strip().lower() for item in filetypes.replace(";", ",").split(",")]
        if any(not item.startswith(".") or not item[1:].isalnum() for item in listed):
            raise SubmissionFlowError("Moodle-Dateitypen sind hier nicht eindeutig prüfbar; bitte direkt in Moodle abgeben")
        extensions = frozenset(listed)
    return min(maximum_files, MAX_FILES), min(maximum_bytes, MAX_FILE_BYTES), extensions


def fetch_preflight(client: MoodleClient, assignment: Assignment, course_source_id: str) -> Preflight:
    auth = client.check_auth()
    required = {"mod_assign_get_assignments", "mod_assign_get_submission_status",
                "mod_assign_save_submission"}
    if not required <= auth.capabilities:
        raise SubmissionFlowError("Moodle bietet die nötigen Abgabefunktionen nicht an")
    source_id = assignment_source_id(assignment)
    listing = client.call("mod_assign_get_assignments", **{"courseids[0]": course_source_id})
    groups = listing.get("courses") if isinstance(listing, dict) else None
    metadata = None
    for group in groups if isinstance(groups, list) else []:
        if not isinstance(group, dict) or str(group.get("id")) != course_source_id:
            continue
        items = group.get("assignments")
        metadata = next((item for item in items if isinstance(item, dict)
                         and str(item.get("id")) == str(source_id)), None) if isinstance(items, list) else None
        break
    if not isinstance(metadata, dict):
        raise SubmissionFlowError("Aufgabe fehlt in der aktuellen Moodle-Liste")
    payload = client.call("mod_assign_get_submission_status", assignid=source_id)
    check, submission = parse_submission(assignment, payload, metadata)
    if check.status == "unclear" or check.status == "graded":
        raise SubmissionFlowError("Abgabestatus ist unklar oder bereits bewertet; bitte direkt in Moodle prüfen")
    now = datetime.now(UTC)
    opened = metadata.get("allowsubmissionsfromdate")
    if isinstance(opened, int) and opened > now.timestamp():
        raise SubmissionFlowError("Die Moodle-Abgabe ist noch nicht geöffnet")
    if check.cutoff_at is not None and now >= check.cutoff_at:
        raise SubmissionFlowError("Der Moodle-Abgabeschluss ist erreicht")
    maximum_files, maximum_bytes, extensions = _file_rules(metadata)
    final_required = _switch(metadata.get("submissiondrafts"))
    statement_required = _switch(metadata.get("requiresubmissionstatement"))
    if final_required is None or statement_required is None:
        raise SubmissionFlowError("Moodle-Einreichungsregeln sind unvollständig")
    statement_text = metadata.get("submissionstatement")
    if statement_required and (not isinstance(statement_text, str) or not statement_text.strip()):
        raise SubmissionFlowError("Eigenständigkeitserklärung fehlt; bitte direkt in Moodle einreichen")
    if final_required and "mod_assign_submit_for_grading" not in auth.capabilities:
        raise SubmissionFlowError("Moodle bietet das finale Einreichen hier nicht an")
    return Preflight(check, submission, metadata, maximum_files, maximum_bytes, extensions,
                     final_required, statement_required,
                     statement_text.strip() if isinstance(statement_text, str) else None)


def revision(check: SubmissionCheck, submission: dict[str, Any]) -> str:
    stable = {"status": check.status, "id": submission.get("id"),
              "timemodified": submission.get("timemodified")}
    return hashlib.sha256(json.dumps(stable, sort_keys=True).encode("utf-8")).hexdigest()


def validate_files(files: list[tuple[str, bytes]], preflight: Preflight) -> list[dict[str, str | int]]:
    if not files or len(files) > preflight.maximum_files:
        raise SubmissionFlowError(f"Bitte 1 bis {preflight.maximum_files} Dateien wählen")
    seen: set[str] = set()
    total = 0
    records: list[dict[str, str | int]] = []
    for index, (name, content) in enumerate(files, 1):
        if (not name or len(name) > 150 or name != Path(name).name or "\\" in name
                or any(ord(char) < 32 for char in name) or name.casefold() in seen):
            raise SubmissionFlowError("Dateiname ist ungültig oder mehrfach vorhanden")
        seen.add(name.casefold())
        total += len(content)
        if not content or len(content) > preflight.maximum_bytes or total > MAX_TOTAL_BYTES:
            raise SubmissionFlowError("Dateigröße überschreitet die Moodle-Vorgaben")
        if preflight.extensions is not None and Path(name).suffix.lower() not in preflight.extensions:
            raise SubmissionFlowError("Dateityp ist für diese Moodle-Aufgabe nicht zugelassen")
        records.append({"name": name, "stored_name": f"{index:03d}-{safe_name(name)}",
                        "size": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    return records


def store_prepared(settings: Settings, attempt_id: str, files: list[tuple[str, bytes]],
                   records: list[dict[str, str | int]]) -> None:
    folder = ensure_directory(settings.data_dir, "submissions", "prepared", attempt_id)
    for (_, content), record in zip(files, records, strict=True):
        write_once(folder / str(record["stored_name"]), content)


def load_prepared(settings: Settings, attempt_id: str,
                  records: list[dict[str, str | int]]) -> list[tuple[str, bytes]]:
    folder = settings.data_dir / "submissions" / "prepared" / attempt_id
    if folder.is_symlink() or not folder.is_dir():
        raise SubmissionFlowError("Vorbereitete Dateien fehlen")
    result = []
    for record in records:
        path = folder / str(record["stored_name"])
        if path.is_symlink() or not path.is_file():
            raise SubmissionFlowError("Vorbereitete Datei fehlt")
        content = path.read_bytes()
        if len(content) != record["size"] or hashlib.sha256(content).hexdigest() != record["sha256"]:
            raise SubmissionFlowError("Vorbereitete Datei hat sich verändert")
        result.append((str(record["name"]), content))
    return result


def verify_remote_files(client: MoodleClient, submission: dict[str, Any],
                        records: list[dict[str, str | int]]) -> None:
    remote = _submission_files(submission)
    expected = {str(record["name"]): record for record in records}
    if len(remote) != len(records):
        raise SubmissionFlowError("Moodle-Dateiliste weicht von der Auswahl ab")
    for index, item in enumerate(remote, 1):
        name = item.get("filename")
        url = item.get("fileurl")
        clean_url = safe_external_url(url) if isinstance(url, str) else None
        if (not isinstance(name, str) or name not in expected or clean_url is None):
            raise SubmissionFlowError("Moodle-Dateiliste konnte nicht geprüft werden")
        record = expected.pop(name)
        data = client.download(RemoteResource(
            f"submission-verify:{index}", name, clean_url, "file", size=int(record["size"])))
        if hashlib.sha256(data).hexdigest() != record["sha256"]:
            raise SubmissionFlowError("Moodle-Datei stimmt nicht mit der Auswahl überein")


def upload_and_save(client: MoodleClient, assignment: Assignment,
                    files: list[tuple[str, bytes]], final_submit: bool,
                    accept_statement: bool) -> None:
    item_id = 0
    for name, content in files:
        item_id = client.upload_draft(name, content, item_id)
    result = client.call("mod_assign_save_submission", assignid=assignment_source_id(assignment),
                         **{"plugindata[files_filemanager]": item_id})
    if not isinstance(result, dict) or result.get("warnings"):
        raise SubmissionFlowError("Moodle hat die gespeicherte Abgabe nicht bestätigt")
    if final_submit:
        result = client.call("mod_assign_submit_for_grading", assignid=assignment_source_id(assignment),
                             acceptsubmissionstatement=int(accept_statement))
        if not isinstance(result, dict) or result.get("warnings"):
            raise SubmissionFlowError("Moodle hat das finale Einreichen nicht bestätigt")
