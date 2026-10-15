# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read weekly summaries locally and configure the Sunday message."""

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import Settings
from app.db.models import DigestPreference
from app.digest.service import (
    DigestSummary,
    build_digest,
    digest_enabled,
    latest_digest,
)
from app.host.lease import HostCoordinator


class DigestView(BaseModel):
    enabled: bool
    preview: bool
    generated_at: datetime | None
    summary: DigestSummary


class DigestPreferenceInput(BaseModel):
    enabled: bool


class DigestPreferenceView(BaseModel):
    enabled: bool


def digest_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/digest")

    @router.get("", response_model=DigestView)
    def get_digest():
        with factory() as session:
            latest = latest_digest(session)
            if latest:
                summary, generated_at = latest
                return DigestView(enabled=digest_enabled(session), preview=False,
                                  generated_at=generated_at, summary=summary)
            return DigestView(enabled=digest_enabled(session), preview=True, generated_at=None,
                              summary=build_digest(session, settings, datetime.now(settings.timezone)))

    @router.get("/preference", response_model=DigestPreferenceView)
    def get_preference():
        with factory() as session:
            return DigestPreferenceView(enabled=digest_enabled(session))

    @router.patch("/preference", response_model=DigestPreferenceView)
    def set_preference(payload: DigestPreferenceInput):
        coordinator.assert_writer()
        with factory() as session:
            preference = session.get(DigestPreference, 1)
            if preference is None:
                preference = DigestPreference(id=1, enabled=payload.enabled)
                session.add(preference)
            else:
                preference.enabled = payload.enabled
            session.commit()
            return DigestPreferenceView(enabled=payload.enabled)

    return router
