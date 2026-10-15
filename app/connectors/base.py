# SPDX-License-Identifier: AGPL-3.0-or-later

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class RemoteResource:
    key: str
    name: str
    url: str
    kind: str
    section_key: str | None = None
    modified: int | None = None
    size: int | None = None
    force_check: bool = False
    filename: str | None = None


@dataclass(frozen=True)
class RemoteSection:
    key: str
    name: str
    position: int


@dataclass(frozen=True)
class RemoteAssignment:
    key: str
    title: str
    due_timestamp: int | None
    url: str | None
    description: str = ""
    opens_timestamp: int | None = None


@dataclass(frozen=True)
class RemoteAnnouncement:
    key: str
    title: str
    created_timestamp: int | None
    url: str | None
    body: str = ""


@dataclass(frozen=True)
class RemoteEvent:
    key: str
    title: str
    starts_timestamp: int
    ends_timestamp: int | None
    url: str | None
    course_key: str | None = None


@dataclass
class RemoteCourse:
    key: str
    name: str
    short_name: str | None = None
    own_group_names: list[str] = field(default_factory=list)
    sections: list[RemoteSection] = field(default_factory=list)
    resources: list[RemoteResource] = field(default_factory=list)
    assignments: list[RemoteAssignment] = field(default_factory=list)
    announcements: list[RemoteAnnouncement] = field(default_factory=list)


@dataclass
class Snapshot:
    courses: list[RemoteCourse]
    events: list[RemoteEvent] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    assignments_complete: bool = False
    notices: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ConnectorAuth:
    account_id: str
    capabilities: frozenset[str] = frozenset()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ConnectorStatus:
    status: str
    message: str | None = None


class Connector(Protocol):
    name: str

    def check_auth(self) -> ConnectorAuth: ...

    def list_courses(self) -> list[RemoteCourse]: ...

    def fetch_changes(self, since: int | None = None) -> Snapshot: ...

    def download(self, resource: RemoteResource) -> bytes: ...

    def health(self) -> ConnectorStatus: ...
