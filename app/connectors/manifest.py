# SPDX-License-Identifier: AGPL-3.0-or-later

"""Versioned, reviewable connector permissions declared by UniOS core."""

import hashlib
import json
import re
from importlib.resources import files
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONNECTOR_API_VERSION = 1
Capability = Literal[
    "courses.read", "materials.read", "assignments.read", "announcements.read",
    "calendar.read", "grades.read", "exams.read", "enrollments.read",
    "submissions.read", "submissions.write", "profile.read", "messages.read",
]


class ConnectorManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    package: str
    package_version: str
    api_version: Literal[1]
    capabilities: set[Capability]
    domains: set[str]
    secrets: set[str]
    review_status: Literal["verified", "reference"]
    runtime: Literal["trusted_python", "container"] = "trusted_python"
    image: str | None = None
    maintainer: str = Field(default="UniOS", min_length=2, max_length=100)
    source_url: str = "https://github.com/EinfachMxrc/unios-app"
    license: str = Field(default="AGPL-3.0-or-later", max_length=80)
    signature_status: Literal["unsigned"] = "unsigned"

    @field_validator("source_url")
    @classmethod
    def source_https(cls, value: str) -> str:
        from urllib.parse import urlsplit
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or len(value) > 500:
            raise ValueError("Quelladresse muss eine öffentliche HTTPS-Adresse sein")
        return value

    @model_validator(mode="after")
    def validate_runtime(self) -> "ConnectorManifest":
        if self.runtime == "container":
            if not self.image or not re.fullmatch(
                r"[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}", self.image
            ):
                raise ValueError("Container-Connectoren brauchen ein Image mit SHA-256-Digest")
        elif self.image is not None:
            raise ValueError("Python-Connectoren dürfen kein Container-Image deklarieren")
        return self

    @field_validator("domains")
    @classmethod
    def validate_domains(cls, values: set[str]) -> set[str]:
        if any(not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}", value)
               or value.startswith(".") for value in values):
            raise ValueError("Connector-Domains müssen exakte DNS-Namen sein")
        return values

    @field_validator("secrets")
    @classmethod
    def validate_secrets(cls, values: set[str]) -> set[str]:
        if any(not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", value) for value in values):
            raise ValueError("Ungültiger Connector-Secret-Name")
        return values

    @property
    def fingerprint(self) -> str:
        payload = self.model_dump(mode="json")
        for key in ("capabilities", "domains", "secrets"):
            payload[key] = sorted(payload[key])
        encoded = json.dumps(payload, sort_keys=True,
                             separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()


def verified_registry() -> dict[str, ConnectorManifest]:
    raw = json.loads(files("app.connectors").joinpath("registry.json").read_text(encoding="utf-8"))
    if raw.get("schema_version") != 1:
        raise ValueError("Unbekannte Connector-Registry-Version")
    manifests = [ConnectorManifest.model_validate(item) for item in raw["connectors"]]
    if len({item.id for item in manifests}) != len(manifests):
        raise ValueError("Doppelte Connector-ID in der Registry")
    return {item.id: item for item in manifests}


def registered_profiles() -> list[dict[str, object]]:
    """Public catalog; profile configuration stays in separate YAML files."""
    raw = json.loads(files("app.connectors").joinpath("registry.json").read_text(encoding="utf-8"))
    if raw.get("schema_version") != 1:
        raise ValueError("Unbekannte Connector-Registry-Version")
    profiles = raw["profiles"]
    if not isinstance(profiles, list) or len({item["slug"] for item in profiles}) != len(profiles):
        raise ValueError("Ungültige Hochschulprofil-Registry")
    return profiles
