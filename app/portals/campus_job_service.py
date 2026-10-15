# SPDX-License-Identifier: AGPL-3.0-or-later
"""Thread-safe import status; a new sign-in invalidates only a login failure."""

from threading import Lock
from typing import Literal

from pydantic import BaseModel


class ImportStatus(BaseModel):
    state: Literal["idle", "running", "done", "error"]
    message: str = ""
    report: dict | None = None
    login_required: bool = False


class CampusImportJob:
    def __init__(self):
        self._lock = Lock()
        self._status = ImportStatus(state="idle")
        self._login_generation = 0
        self._started_generation = 0

    def snapshot(self) -> ImportStatus:
        with self._lock:
            return self._status.model_copy(deep=True)

    def begin(self) -> None:
        with self._lock:
            self._status = ImportStatus(state="running")
            self._started_generation = self._login_generation

    def complete(self, report: dict) -> None:
        with self._lock:
            self._status = ImportStatus(state="done", report=report)

    def fail(self, message: str, *, login_required: bool = False) -> None:
        with self._lock:
            if login_required and self._started_generation != self._login_generation:
                self._status = ImportStatus(state="idle")
            else:
                self._status = ImportStatus(state="error", message=message, login_required=login_required)

    def login_saved(self) -> None:
        with self._lock:
            self._login_generation += 1
            if self._status.state == "error" and self._status.login_required:
                self._status = ImportStatus(state="idle")
