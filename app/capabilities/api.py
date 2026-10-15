# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only capability overview for the System page."""

from fastapi import APIRouter

from app.capabilities.service import Capability, CapabilityService


def capability_router(service: CapabilityService) -> APIRouter:
    router = APIRouter(prefix="/api/capabilities")

    @router.get("", response_model=list[Capability])
    def list_capabilities():
        return service.list()

    return router
