# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local study analytics and explicit first-open tracking."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.analytics.repository import AnalyticsRepository
from app.analytics.service import AnalyticsService, StudyAnalytics
from app.host.lease import HostCoordinator


def analytics_router(service: AnalyticsService, repository: AnalyticsRepository,
                     coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/analytics")

    @router.get("/study", response_model=StudyAnalytics)
    def study():
        return service.report()

    @router.post("/material-versions/{version_id}/opened", status_code=204)
    def record_open(version_id: int):
        coordinator.assert_writer()
        if not repository.record_open(version_id, datetime.now(UTC)):
            raise HTTPException(404, "Materialversion nicht gefunden")

    return router
