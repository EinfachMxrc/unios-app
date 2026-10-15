# SPDX-License-Identifier: AGPL-3.0-or-later
from fastapi import APIRouter

from app.release.service import ReleaseHealthService
from app.web.contracts import ReleaseHealthView


def release_health_router(service: ReleaseHealthService):
    router = APIRouter(prefix='/api/release', tags=['release-health'])

    @router.get('/health', response_model=ReleaseHealthView, response_model_exclude_unset=True)
    def health():
        return service.status()

    return router
