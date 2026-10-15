# SPDX-License-Identifier: AGPL-3.0-or-later

"""Session-protected API for declarative add-on catalog, grants and slots."""

import base64

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.addons.manifest import ExtensionManifest, ExtensionManifestV2, ExtensionSlot
from app.addons.service import AddonError, AddonService
from app.host.lease import HostCoordinator
from app.web.contracts import (
    AddonCatalogEntryView,
    AddonImportView,
    AddonNavigationView,
    AddonRenderedView,
    AddonStateView,
    PublicObject,
)


class AddonPackageRequest(BaseModel):
    manifest: ExtensionManifestV2
    module_base64: str = Field(max_length=2_670_000)


class FingerprintRequest(BaseModel):
    fingerprint: str


def addon_router(service: AddonService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/addons", tags=["addons"])

    def execute(operation):
        try:
            return operation()
        except AddonError as exc:
            raise HTTPException(exc.status_code, str(exc)) from None
        except (OSError, TypeError, ValueError):
            raise HTTPException(503, "Addon-Speicher ist nicht verfügbar") from None

    @router.get("/catalog", response_model=list[AddonCatalogEntryView], response_model_exclude_unset=True)
    def catalog():
        return execute(service.catalog)

    @router.get("/navigation", response_model=list[AddonNavigationView], response_model_exclude_unset=True)
    def navigation():
        return execute(service.navigation)

    @router.get("/slots/{slot}", response_model=list[AddonRenderedView], response_model_exclude_unset=True)
    def slot_widgets(slot: ExtensionSlot, course_id: int | None = Query(default=None, ge=1)):
        return execute(lambda: service.slots(slot, course_id))

    @router.get("/pages/{addon_id}", response_model=AddonRenderedView, response_model_exclude_unset=True)
    def page(addon_id: str):
        return execute(lambda: service.page(addon_id))

    @router.post("/import", response_model=AddonImportView, response_model_exclude_unset=True)
    def import_manifest(manifest: ExtensionManifest):
        coordinator.assert_writer()
        return execute(lambda: service.import_manifest(manifest))

    @router.post("/import-package", response_model=AddonImportView, response_model_exclude_unset=True)
    def import_package(payload: AddonPackageRequest):
        coordinator.assert_writer()
        try:
            binary = base64.b64decode(payload.module_base64, validate=True)
        except ValueError:
            raise HTTPException(422, "Ungültiges WASM-Paket") from None
        return execute(lambda: service.import_package(payload.manifest, binary))

    @router.post("/{addon_id}/execute", response_model=PublicObject, response_model_exclude_unset=True)
    def run(addon_id: str, payload: FingerprintRequest):
        coordinator.assert_writer()
        result = execute(lambda: service.execute(addon_id, payload.fingerprint))
        coordinator.assert_writer()
        return result

    @router.post("/{addon_id}/{action}", response_model=AddonStateView, response_model_exclude_unset=True)
    def change(addon_id: str, action: str, payload: FingerprintRequest):
        coordinator.assert_writer()
        return execute(lambda: service.action(addon_id, payload.fingerprint, action))

    return router
