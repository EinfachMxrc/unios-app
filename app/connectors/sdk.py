# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stable public connector API v1: scoped context and common data contracts."""

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from urllib.parse import urlsplit

import httpx

from app.connectors.base import (  # re-exported as the public v1 contracts
    Connector,
    ConnectorAuth,
    ConnectorStatus,
    RemoteAnnouncement,
    RemoteAssignment,
    RemoteCourse,
    RemoteEvent,
    RemoteResource,
    RemoteSection,
    Snapshot,
)
from app.connectors.manifest import CONNECTOR_API_VERSION, Capability, ConnectorManifest

MAX_HTTP_BODY = 32 * 1024 * 1024


def _check_url(url: str, domains: frozenset[str] | set[str]) -> None:
    parsed = urlsplit(url)
    try:
        allowed_port = parsed.port in (None, 443)
    except ValueError:
        allowed_port = False
    if (parsed.scheme != "https" or parsed.hostname not in domains or not allowed_port
            or parsed.username or parsed.password):
        raise ValueError("Ziel liegt außerhalb der freigegebenen Connector-Domains")


@dataclass(frozen=True)
class ConnectorContext:
    id: str
    profile_slug: str
    config: Mapping[str, object]
    capabilities: frozenset[Capability]
    domains: frozenset[str]
    secrets: Mapping[str, str]

    def get(self, url: str, *, timeout: float = 20) -> httpx.Response:
        """Fetch HTTPS only from a declared domain, with no ambient credentials."""
        _check_url(url, self.domains)
        with (httpx.Client(follow_redirects=False, trust_env=False, timeout=timeout) as client,
              client.stream("GET", url) as streamed):
            body = bytearray()
            for part in streamed.iter_bytes():
                if len(body) + len(part) > MAX_HTTP_BODY:
                    raise ValueError("Connector-HTTP-Antwort zu groß")
                body.extend(part)
            return httpx.Response(streamed.status_code, headers=streamed.headers,
                                  content=bytes(body), request=streamed.request)


def connector_context(manifest: ConnectorManifest, profile_slug: str,
                      config: dict[str, object], secrets: dict[str, str]) -> ConnectorContext:
    return ConnectorContext(
        id=manifest.id, profile_slug=profile_slug, config=MappingProxyType(config.copy()),
        capabilities=frozenset(manifest.capabilities), domains=frozenset(manifest.domains),
        secrets=MappingProxyType(secrets.copy()),
    )


class PermissionedConnector:
    """Reject undeclared data and outbound resource URLs at the core boundary."""

    def __init__(self, connector: Connector, manifest: ConnectorManifest):
        self.delegate = connector
        self.manifest = manifest
        self.name = connector.name

    def _url(self, url: str | None) -> None:
        if not url:
            return
        _check_url(url, self.manifest.domains)

    def _courses(self, courses: list[RemoteCourse]) -> None:
        if courses and "courses.read" not in self.manifest.capabilities:
            raise ValueError("Connector darf keine Kurse lesen")
        for course in courses:
            if course.resources and "materials.read" not in self.manifest.capabilities:
                raise ValueError("Connector lieferte nicht freigegebene Materialien")
            if course.assignments and "assignments.read" not in self.manifest.capabilities:
                raise ValueError("Connector lieferte nicht freigegebene Aufgaben")
            if course.announcements and "announcements.read" not in self.manifest.capabilities:
                raise ValueError("Connector lieferte nicht freigegebene Ankündigungen")
            for resource in course.resources:
                self._url(resource.url)
            for assignment in course.assignments:
                self._url(assignment.url)
            for announcement in course.announcements:
                self._url(announcement.url)

    def check_auth(self) -> ConnectorAuth:
        result = self.delegate.check_auth()
        if not result.capabilities.issubset(self.manifest.capabilities):
            raise ValueError("Connector meldete nicht freigegebene Fähigkeiten")
        return result

    def list_courses(self) -> list[RemoteCourse]:
        if "courses.read" not in self.manifest.capabilities:
            raise ValueError("Connector darf keine Kurse lesen")
        result = self.delegate.list_courses()
        self._courses(result)
        return result

    def fetch_changes(self, since: int | None = None) -> Snapshot:
        if not self.manifest.capabilities.intersection(
            {"courses.read", "materials.read", "assignments.read", "announcements.read", "grades.read",
             "exams.read", "enrollments.read", "submissions.read", "calendar.read",
             "profile.read", "messages.read"}
        ):
            raise ValueError("Connector hat keine Leseberechtigung")
        result = self.delegate.fetch_changes(since)
        self._courses(result.courses)
        if result.events and "calendar.read" not in self.manifest.capabilities:
            raise ValueError("Connector lieferte nicht freigegebene Termine")
        for item in result.events:
            self._url(item.url)
        return result

    def download(self, resource: RemoteResource) -> bytes:
        if "materials.read" not in self.manifest.capabilities:
            raise ValueError("Connector darf keine Materialien laden")
        self._url(resource.url)
        return self.delegate.download(resource)

    def health(self) -> ConnectorStatus:
        return self.delegate.health()


__all__ = [
    "CONNECTOR_API_VERSION",
    "Connector",
    "ConnectorAuth",
    "ConnectorContext",
    "ConnectorStatus",
    "RemoteAnnouncement",
    "RemoteAssignment",
    "RemoteCourse",
    "RemoteEvent",
    "RemoteResource",
    "RemoteSection",
    "Snapshot",
]
