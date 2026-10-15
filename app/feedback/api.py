# SPDX-License-Identifier: AGPL-3.0-or-later

"""Explicit allowlist for diagnostics a tester may choose to export."""

from __future__ import annotations

import platform
from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings
from app.host.lease import HostCoordinator, HostLeaseError
from app.host.syncthing import folder_sync_status


def _version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "unknown"


def feedback_router(settings: Settings, factory, coordinator: HostCoordinator,
                    connectors: list[object]) -> APIRouter:
    router = APIRouter(prefix="/api/feedback")

    @router.get("/diagnostics")
    def diagnostics() -> dict[str, object]:
        try:
            with factory() as session:
                schema_version = session.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        except SQLAlchemyError:
            schema_version = None
        try:
            lease = coordinator.current()
            mode = "released" if lease and lease.released_at else "host" if coordinator.is_writer else "standby"
            generation = lease.generation if lease else None
        except (HostLeaseError, OSError):
            mode, generation = "unknown", None
        sync = folder_sync_status(settings.syncthing_api_url, settings.syncthing_api_key,
                                  settings.syncthing_folder_id)
        connector_versions = []
        for connector in connectors:
            manifest = getattr(connector, "manifest", None)
            if manifest is not None:
                connector_versions.append({"id": manifest.id, "version": manifest.package_version})
            elif getattr(connector, "name", None) == "moodle":
                connector_versions.append({"id": "moodle", "version": _version("moodle-dl")})
        error_codes = []
        if schema_version is None:
            error_codes.append("SCHEMA_UNAVAILABLE")
        if mode == "unknown":
            error_codes.append("HOST_UNKNOWN")
        if settings.syncthing_folder_id and not sync.complete:
            error_codes.append("SYNC_INCOMPLETE")
        return {
            "app_version": _version("unios"),
            "schema_version": schema_version,
            "os": platform.system(),
            "os_version": platform.release(),
            "connectors": sorted(connector_versions, key=lambda item: item["id"]),
            "host": {"mode": mode, "generation": generation},
            "sync": "complete" if sync.complete else "not_configured" if not settings.syncthing_folder_id else "incomplete",
            "error_codes": error_codes,
        }

    return router
