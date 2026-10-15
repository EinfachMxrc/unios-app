# SPDX-License-Identifier: AGPL-3.0-or-later
"""Public platform responses. Entity/plugin payloads follow their own catalogs."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.addons.manifest import PageSpec, WidgetSpec

# Dynamic entities and action outputs are described by /api/schema, while
# third-party providers may add fields. Do not discard their validated output.
PublicObject = dict[str, Any]


class PublicView(BaseModel):
    model_config = ConfigDict(extra='allow')


class AddonCatalogEntryView(PublicView):
    id: str
    name: str
    author: str
    version: str
    description: str
    schema_version: Literal[1, 2]
    runtime: Literal['declarative', 'wasm']
    permissions: list[str]
    widgets: list[WidgetSpec]
    page: PageSpec | None
    fingerprint: str
    source: str
    installed: bool
    approved: bool
    enabled: bool


class AddonNavigationView(PublicView):
    id: str
    name: str
    url: str


class AddonRenderedView(PublicView):
    view: str
    title: str
    body: str
    addon_id: str
    items: list[PublicObject] = Field(default_factory=list)


class AddonImportView(PublicView):
    id: str
    fingerprint: str
    imported: bool


class AddonStateView(PublicView):
    id: str
    installed: bool
    approved: bool
    enabled: bool


class ConnectorEntryView(PublicView):
    id: str
    runtime: str
    package: str
    package_version: str
    approved: bool
    profile_enabled: bool
    installed: bool | None
    fingerprint: str


class UniversityProfileView(PublicView):
    slug: str
    name: str


class ConnectorRegistryView(PublicView):
    connectors: list[ConnectorEntryView]
    profiles: list[UniversityProfileView]
    active_profile: str
    pending_profile: str | None
    enabled_connectors: list[str]


class ProfileSelectionView(PublicView):
    active_profile: str
    pending_profile: str
    restart_required: bool


class ConnectorChangeView(PublicView):
    id: str
    installed: bool = False
    approved: bool = False
    enabled: bool = False
    fingerprint: str | None = None
    alias: str | None = None
    stored: bool = False
    restart_required: bool = False


class BackgroundJobView(PublicView):
    id: str
    kind: str
    target_id: int | None
    mode: str
    state: str
    completed: int
    total: int
    error_code: str | None
    created_at: datetime
    updated_at: datetime
    retry_of: str | None


class JobTargetView(PublicView):
    id: int
    label: str


class DatabaseHealthView(PublicView):
    status: str
    schema_version: str | None = Field(alias='schema')


class RecoveryStatusView(PublicView):
    mode: str
    background_work: bool
    reason: str | None = None
    database: DatabaseHealthView | None = None


class ReleaseHealthView(PublicView):
    checked_at: datetime
    database: DatabaseHealthView
    index: PublicObject | None
    allowed_entries: int | None
    connectors: list[PublicObject]
    metadata_status: str


class SetupStatusView(PublicView):
    installed: bool
    completed: bool
    institution: str
    institution_name: str
    profiles: list[UniversityProfileView]
    pending_institution: str | None
    institution_confirmed: bool
    moodle_available: bool
    moodle_connected: bool
    notifications: Literal['tested', 'off'] | None
    initial_sync: PublicObject | None
    portals: list[PublicObject]
    study_program: str | None
    study_program_confirmed: bool


class PortalSampleView(PublicView):
    file: str
    folder: str
    pages: int


class MoodleLoginView(PublicView):
    login_url: str
