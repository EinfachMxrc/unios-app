# SPDX-License-Identifier: AGPL-3.0-or-later

"""Validated profiles keep university-specific addresses outside connector code."""

from __future__ import annotations

import json
import os
import re
import secrets
from importlib.resources import files
from pathlib import Path
from typing import Literal

import yaml
from filelock import FileLock
from pydantic import BaseModel, Field, HttpUrl


class PortalProfile(BaseModel):
    base_url: HttpUrl | None = None
    login_start_url: HttpUrl | None = None
    auth_cookie_hosts: list[str] = Field(default_factory=list)
    institution_code: str | None = None
    selector_alias_map: str | None = None
    selectors: dict[str, str | None] = Field(default_factory=dict)


class CanteenProfile(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{1,80}$")
    name: str
    provider: str = "swo"


class MailProfile(BaseModel):
    web_url: HttpUrl | None = None
    protocol: str | None = None
    host: str | None = None
    port: int | None = None
    sender_rules: list[str] = Field(default_factory=list)


class GradingProfile(BaseModel):
    scale: str | None = None
    weighting: str | None = None


class ConnectorBinding(BaseModel):
    enabled: bool = True
    config: dict[str, str | int | bool | None] = Field(default_factory=dict)


class InstitutionProfile(BaseModel):
    name: str
    connectors: dict[str, ConnectorBinding] = Field(default_factory=dict)
    moodle_url: HttpUrl | None = None
    primuss: PortalProfile
    mycampus: PortalProfile
    mail: MailProfile
    canteens: list[CanteenProfile] = Field(default_factory=list)
    room_booking_provider: Literal["coburg-myapps"] | None = None
    public_deadline_urls: list[HttpUrl] = Field(default_factory=list)
    grading: GradingProfile


def load_institution(slug: str) -> InstitutionProfile:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Ungültiger Hochschulprofil-Name")
    source = files("institutions").joinpath(f"{slug}.yaml")
    return InstitutionProfile.model_validate(yaml.safe_load(source.read_text(encoding="utf-8")))


def chosen_institution(local_dir: Path) -> str | None:
    path = local_dir / "institution-profile.json"
    if not path.exists():
        return None
    if path.is_symlink():
        raise ValueError("Ungültige Hochschulprofil-Auswahl")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("version") != 1 or not isinstance(raw.get("slug"), str):
        raise ValueError("Ungültige Hochschulprofil-Auswahl")
    from app.connectors.manifest import registered_profiles

    if raw["slug"] not in {item["slug"] for item in registered_profiles()}:
        raise ValueError("Hochschulprofil ist nicht in der Registry")
    return raw["slug"]


def save_institution_choice(local_dir: Path, slug: str) -> None:
    from app.connectors.manifest import registered_profiles

    if slug not in {item["slug"] for item in registered_profiles()}:
        raise ValueError("Hochschulprofil ist nicht in der Registry")
    load_institution(slug)
    local_dir.mkdir(parents=True, exist_ok=True)
    path = local_dir / "institution-profile.json"
    with FileLock(f"{path}.lock", timeout=5):
        if path.is_symlink():
            raise ValueError("Ungültige Hochschulprofil-Auswahl")
        temporary = path.with_name(path.name + "." + secrets.token_hex(8) + ".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump({"version": 1, "slug": slug}, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
