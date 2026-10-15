# SPDX-License-Identifier: AGPL-3.0-or-later

"""Versioned manifest for data-only add-ons; no third-party code is loaded."""

import hashlib
import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

ExtensionPermission = Literal["courses.read", "study_blocks.read"]
ExtensionSlot = Literal[
    "today.secondary", "course.sidebar", "course.tools", "learning.tools",
    "note.toolbar", "material.actions", "more.section",
]
DataView = Literal["text", "courses", "study_blocks"]
PageView = Literal["focus_timer", "text", "courses", "study_blocks"]

VIEW_PERMISSION: dict[str, ExtensionPermission] = {
    "courses": "courses.read",
    "study_blocks": "study_blocks.read",
}


class WidgetSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: ExtensionSlot
    view: DataView
    title: str = Field(min_length=2, max_length=80)
    body: str = Field(default="", max_length=500)
    limit: int = Field(default=3, ge=1, le=6)


class PageSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    view: PageView
    title: str = Field(min_length=2, max_length=80)
    body: str = Field(default="", max_length=1000)
    limit: int = Field(default=12, ge=1, le=30)
    duration_minutes: int = Field(default=25, ge=1, le=120)
    break_minutes: int = Field(default=5, ge=1, le=60)


class ExtensionManifestV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    id: str = Field(pattern=r"^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$", max_length=100)
    name: str = Field(min_length=2, max_length=80)
    author: str = Field(min_length=2, max_length=80)
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$", max_length=30)
    description: str = Field(min_length=10, max_length=500)
    kind: Literal["feature", "ui"]
    permissions: set[ExtensionPermission] = Field(default_factory=set, max_length=8)
    network_domains: list[str] = Field(default_factory=list, max_length=0)
    runtime: Literal["declarative"] = "declarative"
    widgets: list[WidgetSpec] = Field(default_factory=list, max_length=8)
    page: PageSpec | None = None

    @model_validator(mode="after")
    def validate_contract(self) -> "ExtensionManifestV1":
        if self.kind == "feature" and self.page is None:
            raise ValueError("Feature-Addons brauchen eine Seite")
        if self.kind == "ui" and not self.widgets:
            raise ValueError("UI-Addons brauchen ein Widget")
        if len({widget.slot for widget in self.widgets}) != len(self.widgets):
            raise ValueError("Ein Addon darf jeden Slot nur einmal belegen")
        views: list[str] = [widget.view for widget in self.widgets]
        if self.page is not None:
            views.append(self.page.view)
        missing = {VIEW_PERMISSION[view] for view in views if view in VIEW_PERMISSION} - self.permissions
        if missing:
            raise ValueError("Datenansicht ohne deklarierte Berechtigung: " + ", ".join(sorted(missing)))
        return self

    @property
    def fingerprint(self) -> str:
        payload = self.model_dump(mode="json")
        payload["permissions"] = sorted(payload["permissions"])
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False,
                             separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()


class ExtensionManifestV2(ExtensionManifestV1):
    schema_version: Literal[2]  # type: ignore[assignment]
    runtime: Literal["wasm"] = "wasm"  # type: ignore[assignment]
    wasm_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    api_version: Literal[2] = 2

    @model_validator(mode="after")
    def executable_page(self):
        if self.kind != "feature" or self.page is None or self.page.view != "text" or self.widgets:
            raise ValueError("WASM-Addons verwenden eine explizit gestartete Textseite")
        return self


ExtensionManifest = Annotated[ExtensionManifestV1 | ExtensionManifestV2, Field(discriminator="schema_version")]
manifest_adapter: TypeAdapter[ExtensionManifest] = TypeAdapter(ExtensionManifest)
