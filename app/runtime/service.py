# SPDX-License-Identifier: AGPL-3.0-or-later

"""Apply validated, non-secret preferences to running host components."""

from threading import Lock

from pydantic import BaseModel, Field, model_validator

from app.config import Settings
from app.host.lease import HostCoordinator
from app.runtime.repository import RuntimeRepository
from app.sync.scheduler import SyncScheduler


class RuntimeValues(BaseModel):
    sync_interval_minutes: int = Field(ge=5, le=1440)
    quiet_hours_start: int | None = Field(ge=0, le=23)
    quiet_hours_end: int | None = Field(ge=0, le=23)
    snapshot_interval_minutes: int = Field(ge=1, le=1440)
    deadline_warning_days: list[int] = Field(min_length=1, max_length=10)
    automatic_takeover_enabled: bool

    @model_validator(mode="after")
    def validate_pairs(self) -> "RuntimeValues":
        if (self.quiet_hours_start is None) != (self.quiet_hours_end is None):
            raise ValueError("Ruhezeit braucht Anfang und Ende oder beide leer")
        if any(day < 1 or day > 365 for day in self.deadline_warning_days):
            raise ValueError("Fristwarnungen müssen zwischen 1 und 365 Tagen liegen")
        if len(set(self.deadline_warning_days)) != len(self.deadline_warning_days):
            raise ValueError("Fristwarnungen dürfen sich nicht wiederholen")
        return self


class RuntimeState(BaseModel):
    values: RuntimeValues
    revision: int


class RuntimeConflict(ValueError):
    pass


class RuntimeService:
    def __init__(self, repository: RuntimeRepository, settings: Settings,
                 scheduler: SyncScheduler, coordinator: HostCoordinator):
        self.repository = repository
        self.settings = settings
        self.scheduler = scheduler
        self.coordinator = coordinator
        self._write_lock = Lock()

    def _defaults(self) -> RuntimeValues:
        return RuntimeValues(sync_interval_minutes=self.settings.sync_interval_minutes,
                             quiet_hours_start=self.settings.quiet_hours_start,
                             quiet_hours_end=self.settings.quiet_hours_end,
                             snapshot_interval_minutes=self.settings.snapshot_interval_seconds // 60,
                             deadline_warning_days=list(self.settings.warning_days),
                             automatic_takeover_enabled=self.settings.automatic_takeover_enabled)

    def _apply(self, values: RuntimeValues) -> None:
        old_snapshot = self.settings.snapshot_interval_seconds
        self.settings.sync_interval_minutes = values.sync_interval_minutes
        self.settings.quiet_hours_start = values.quiet_hours_start
        self.settings.quiet_hours_end = values.quiet_hours_end
        self.settings.snapshot_interval_seconds = values.snapshot_interval_minutes * 60
        self.settings.deadline_warning_days = ",".join(str(day) for day in values.deadline_warning_days)
        self.settings.automatic_takeover_enabled = values.automatic_takeover_enabled
        self.scheduler.refresh_runtime_schedule()
        if old_snapshot != self.settings.snapshot_interval_seconds:
            self.coordinator.refresh_snapshot_schedule()

    def load(self) -> RuntimeState:
        row = self.repository.read()
        if row is None:
            return RuntimeState(values=self._defaults(), revision=0)
        values = RuntimeValues.model_validate(row.values)
        self._apply(values)
        return RuntimeState(values=values, revision=row.revision)

    def read(self) -> RuntimeState:
        row = self.repository.read()
        if row is None:
            return RuntimeState(values=self._defaults(), revision=0)
        return RuntimeState(values=RuntimeValues.model_validate(row.values), revision=row.revision)

    def update(self, values: RuntimeValues, expected_revision: int) -> RuntimeState:
        with self._write_lock:
            row = self.repository.save(values.model_dump(), expected_revision)
            if row is None:
                raise RuntimeConflict("Einstellungen wurden inzwischen geändert")
            self._apply(values)
            return RuntimeState(values=values, revision=row.revision)
