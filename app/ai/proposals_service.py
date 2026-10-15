# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared inline/background opt-in AI proposal flow."""

import json

from fastapi import HTTPException
from pydantic import ValidationError

from app.ai.adapter import (
    AdapterCallError,
    BudgetExceededError,
    NotConfiguredError,
    submit,
)
from app.ai.anthropic_adapter import select_adapter
from app.ai.api import AdapterProposeResult, AiPackageRequest, build_ai_package
from app.ai.exercises import ExerciseImport, enqueue_exercises
from app.anki.api import CardImport, enqueue_cards


def propose(factory, settings, payload, check):
    check()
    if not settings.ai_adapter_enabled:
        raise HTTPException(409, "KI-Adapter ist ausgeschaltet")
    if not settings.ai_adapter_api_key:
        raise HTTPException(409, "Kein API-Schlüssel für den KI-Adapter hinterlegt")
    check()
    with factory() as session:
        package = build_ai_package(session, settings, AiPackageRequest(
            course_id=payload.course_id, mode=payload.mode, output="text"))
        prompt = package.content.decode("utf-8")
        adapter = select_adapter(settings)
        try:
            result = submit(session, settings, adapter, settings.ai_adapter_model, prompt,
                            settings.ai_adapter_max_output_tokens)
        except (BudgetExceededError, NotConfiguredError) as exc:
            raise HTTPException(409, str(exc)) from None
        except AdapterCallError as exc:
            raise HTTPException(exc.status_code, str(exc)) from None
        # A provider response may arrive after cancellation or a host takeover.
        # Check before enqueue_cards writes immutable proposal files.
        check()
        try:
            data = json.loads(result.payload)
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(422, "Antwort der KI war kein gültiges JSON") from None
        try:
            imported_count: int
            if payload.mode == "cards":
                imported_count = len(enqueue_cards(session, settings, CardImport.model_validate(data)))
            else:
                imported_count = len(enqueue_exercises(session, ExerciseImport.model_validate(data)))
        except ValidationError as exc:
            fields = [".".join(map(str, error["loc"])) or "Dokument" for error in exc.errors()[:5]]
            raise HTTPException(422, "Ungültiges Ergebnisformat: " + ", ".join(fields)) from None
        check()
        session.commit()
        return AdapterProposeResult(imported=imported_count, tokens_used=result.tokens_used,
                                    model=result.model)
