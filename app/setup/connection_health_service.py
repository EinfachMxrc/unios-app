# SPDX-License-Identifier: AGPL-3.0-or-later
"""Invalidate only the authentication failure disproved by a verified new token."""

from app.setup.connection_health_repository import ConnectionHealthRepository


class ConnectionHealthService:
    def __init__(self, repository: ConnectionHealthRepository):
        self.repository = repository

    def moodle_token_verified(self) -> None:
        self.repository.clear_login_failure("moodle", "Moodle-Token erneuern")
