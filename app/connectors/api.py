# SPDX-License-Identifier: AGPL-3.0-or-later

"""Writer-gated connector catalog, approval and university selection API."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import Settings
from app.connectors.manifest import (
    ConnectorManifest,
    registered_profiles,
    verified_registry,
)
from app.connectors.permissions import ConnectorPermissions
from app.connectors.plugins import listed_connectors
from app.connectors.sandbox import (
    SandboxUnavailable,
    container_installed,
    install_container,
)
from app.connectors.selection import ConnectorSelection
from app.host.lease import HostCoordinator
from app.institutions import (
    chosen_institution,
    load_institution,
    save_institution_choice,
)
from app.secrets import save_connector_secret
from app.web.contracts import (
    ConnectorChangeView,
    ConnectorRegistryView,
    ProfileSelectionView,
)


class FingerprintRequest(BaseModel):
    fingerprint: str


class ProfileRequest(BaseModel):
    slug: str


class EnableRequest(FingerprintRequest):
    enabled: bool


class SecretRequest(FingerprintRequest):
    value: str = Field(min_length=1, max_length=4096)


def connector_registry_router(settings: Settings, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/connectors", tags=["connectors"])
    grants = ConnectorPermissions(settings.local_dir)
    selection = ConnectorSelection(settings.local_dir)

    def manifest_for(name: str, fingerprint: str) -> ConnectorManifest:
        manifest = verified_registry().get(name)
        if manifest is None or manifest.review_status != "verified":
            raise HTTPException(404, "Connector ist nicht in der geprüften Registry")
        if manifest.fingerprint != fingerprint:
            raise HTTPException(409, "Berechtigungen haben sich geändert; bitte erneut prüfen")
        return manifest

    @router.get("/registry", response_model=ConnectorRegistryView, response_model_exclude_unset=True)
    def registry(include_connectors: bool = True):
        return {"connectors": listed_connectors(settings) if include_connectors else [],
                "profiles": registered_profiles(),
                "active_profile": settings.institution_slug,
                "pending_profile": chosen_institution(settings.local_dir),
                "enabled_connectors": sorted(selection.effective({
                    item.strip() for item in settings.connector_plugins.split(",") if item.strip()
                }))}

    @router.post("/profiles/select", response_model=ProfileSelectionView, response_model_exclude_unset=True)
    def select_profile(payload: ProfileRequest):
        coordinator.assert_writer()
        try:
            save_institution_choice(settings.local_dir, payload.slug)
        except (OSError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from None
        return {"active_profile": settings.institution_slug, "pending_profile": payload.slug,
                "restart_required": payload.slug != settings.institution_slug}

    @router.post("/{name}/install", response_model=ConnectorChangeView, response_model_exclude_unset=True)
    def install(name: str, payload: FingerprintRequest):
        coordinator.assert_writer()
        manifest = manifest_for(name, payload.fingerprint)
        try:
            install_container(manifest)
        except SandboxUnavailable as exc:
            raise HTTPException(503, str(exc)) from None
        return {"id": name, "installed": True, "fingerprint": manifest.fingerprint}

    @router.post("/{name}/approve", response_model=ConnectorChangeView, response_model_exclude_unset=True)
    def approve(name: str, payload: FingerprintRequest):
        coordinator.assert_writer()
        manifest = manifest_for(name, payload.fingerprint)
        if manifest.runtime != "container":
            raise HTTPException(409, "Python-Connectoren sind nur im gesonderten Entwicklermodus verfügbar")
        if not container_installed(manifest):
            raise HTTPException(409, "Geprüftes Container-Image zuerst installieren")
        grants.append(manifest, "approve")
        return {"id": name, "approved": True, "fingerprint": manifest.fingerprint}

    @router.post("/{name}/revoke", response_model=ConnectorChangeView, response_model_exclude_unset=True)
    def revoke(name: str, payload: FingerprintRequest):
        coordinator.assert_writer()
        manifest = manifest_for(name, payload.fingerprint)
        selection.set_enabled(name, False)
        grants.append(manifest, "revoke")
        return {"id": name, "approved": False}

    @router.post("/{name}/secrets/{alias}", response_model=ConnectorChangeView, response_model_exclude_unset=True)
    def save_secret(name: str, alias: str, payload: SecretRequest):
        coordinator.assert_writer()
        manifest = manifest_for(name, payload.fingerprint)
        if manifest.runtime != "container" or alias not in manifest.secrets:
            raise HTTPException(404, "Secret-Alias ist nicht für diesen Connector freigegeben")
        if not grants.is_approved(manifest):
            raise HTTPException(409, "Connector zuerst freigeben")
        if not save_connector_secret(name, alias, payload.value):
            raise HTTPException(503, "Sicherer System-Schlüsselbund ist nicht verfügbar")
        return {"id": name, "alias": alias, "stored": True, "restart_required": True}

    @router.post("/{name}/enable", response_model=ConnectorChangeView, response_model_exclude_unset=True)
    def enable(name: str, payload: EnableRequest):
        coordinator.assert_writer()
        manifest = manifest_for(name, payload.fingerprint)
        binding = load_institution(settings.institution_slug).connectors.get(name)
        if payload.enabled and (binding is None or not binding.enabled):
            raise HTTPException(409, "Connector ist in diesem Hochschulprofil nicht aktiviert")
        if payload.enabled and (manifest.runtime != "container" or not container_installed(manifest)
                                or not grants.is_approved(manifest)):
            raise HTTPException(409, "Connector ist nicht isoliert installiert und freigegeben")
        selection.set_enabled(name, payload.enabled)
        return {"id": name, "enabled": payload.enabled, "restart_required": True}

    return router
