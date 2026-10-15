# SPDX-License-Identifier: AGPL-3.0-or-later
"""Authenticated dashboard setup for the local assistant connection."""

from fastapi import APIRouter, HTTPException

from app.ai.connection import McpConnection
from app.ai.connection_repository import enable_connection
from app.integrations.storage import ConnectionError


def connection_router(connection: McpConnection, factory, coordinator) -> APIRouter:
    router = APIRouter(prefix="/api/ai/connection")

    @router.get("")
    def state():
        return {"keyring_available": connection.vault.available(),
                "client_config": connection.client_config()}

    @router.post("")
    def setup():
        coordinator.assert_writer()
        try:
            connection.setup()
        except (ConnectionError, OSError):
            raise HTTPException(503, "KI-Verbindung konnte nicht im System-Schlüsselbund eingerichtet werden") from None
        enable_connection(factory)
        return {"configured": True, "enabled": True}

    return router
