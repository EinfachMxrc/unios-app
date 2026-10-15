# SPDX-License-Identifier: AGPL-3.0-or-later
"""Atomic device-independent slot preferences, separate from subscription credentials."""

from pathlib import Path

from app.integrations.storage import ConnectionStore


class TimetableSelectionRepository:
    def __init__(self, local_dir: Path):
        self.store = ConnectionStore(local_dir, 'timetable-selection')

    def read(self) -> dict:
        return self.store.read()

    def save(self, state: dict) -> None:
        self.store.save(state)
