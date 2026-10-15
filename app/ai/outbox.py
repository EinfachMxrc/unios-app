# SPDX-License-Identifier: AGPL-3.0-or-later

"""Import AI result files exactly once and retain every input for review."""

import json
from contextlib import nullcontext
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from filelock import FileLock
from pydantic import ValidationError

from app.ai.exercises import ExerciseImport, enqueue_exercises
from app.ai.explanations import ExplanationImport, enqueue_explanations
from app.anki.api import CardImport, enqueue_cards
from app.config import Settings
from app.db.models import AiOutboxReceipt
from app.files.atomic import ensure_directory, write_once
from app.host.actions import ActionJournal
from app.host.lease import HostCoordinator

MAX_RESULT_BYTES = 1_000_000


def _archive(source: Path, directory: Path, reason: str | None = None) -> None:
    destination = directory / f"{uuid4().hex}.json"
    source.rename(destination)
    if reason:
        write_once(destination.with_suffix(".error.txt"), (reason + "\n").encode("utf-8"))


def _validation_reason(exc: ValidationError) -> str:
    fields = [".".join(map(str, error["loc"])) or "Dokument" for error in exc.errors()[:5]]
    return "Ungültiges Ergebnisformat: " + ", ".join(fields)


def process_outbox(settings: Settings, factory, coordinator: HostCoordinator,
                   *, record_action: bool = True) -> dict[str, int]:
    coordinator.assert_writer()
    root = ensure_directory(settings.data_dir, "ai")
    outbox = ensure_directory(root, "outbox")
    processed = ensure_directory(outbox, "processed")
    rejected = ensure_directory(outbox, "rejected")
    lock_dir = ensure_directory(settings.local_dir, "ai")
    result = {"processed": 0, "cards": 0, "exercises": 0, "explanations": 0,
              "rejected": 0, "duplicates": 0, "skipped": 0}
    with FileLock(lock_dir / "outbox.lock", timeout=5):
        paths = [path for path in sorted(outbox.iterdir())
                 if path.suffix.lower() == ".json" and not path.is_symlink() and path.is_file()]
        action = (ActionJournal(settings).tracked_operation(coordinator, "ai-outbox")
                  if paths and record_action else nullcontext())
        with action:
            for path in paths:
                size_before = path.stat()
                if size_before.st_size > MAX_RESULT_BYTES:
                    _archive(path, rejected, "Datei ist größer als 1 MB")
                    result["rejected"] += 1
                    continue
                raw = path.read_bytes()
                size_after = path.stat()
                if (size_before.st_size, size_before.st_mtime_ns) != (size_after.st_size, size_after.st_mtime_ns):
                    result["skipped"] += 1
                    continue
                digest = sha256(raw).hexdigest()
                with factory() as session:
                    if session.get(AiOutboxReceipt, digest) is not None:
                        _archive(path, processed)
                        result["duplicates"] += 1
                        continue
                    try:
                        data = json.loads(raw)
                        if not isinstance(data, dict) or sum(
                            key in data for key in ("cards", "exercises", "explanations")
                        ) != 1:
                            raise ValueError("Datei braucht genau einen Ergebnistyp")
                        if "cards" in data:
                            card_count = len(enqueue_cards(session, settings, CardImport.model_validate(data)))
                            exercise_count = 0
                            explanation_count = 0
                        elif "exercises" in data:
                            exercise_count = len(enqueue_exercises(session, ExerciseImport.model_validate(data)))
                            card_count = 0
                            explanation_count = 0
                        else:
                            explanation_count = len(enqueue_explanations(
                                session, settings, ExplanationImport.model_validate(data)))
                            card_count = 0
                            exercise_count = 0
                    except ValidationError as exc:
                        _archive(path, rejected, _validation_reason(exc))
                        result["rejected"] += 1
                        continue
                    except (ValueError, TypeError) as exc:
                        _archive(path, rejected, str(exc) if isinstance(exc, ValueError)
                                 and "Ergebnistyp" in str(exc) else "Ungültige JSON-Datei")
                        result["rejected"] += 1
                        continue
                    except HTTPException as exc:
                        _archive(path, rejected, str(exc.detail))
                        result["rejected"] += 1
                        continue
                    session.add(AiOutboxReceipt(sha256=digest, card_count=card_count,
                                                exercise_count=exercise_count,
                                                explanation_count=explanation_count))
                    session.commit()
                _archive(path, processed)
                result["processed"] += 1
                result["cards"] += card_count
                result["exercises"] += exercise_count
                result["explanations"] += explanation_count
    return result
