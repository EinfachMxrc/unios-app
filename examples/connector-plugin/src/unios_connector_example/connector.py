# SPDX-License-Identifier: AGPL-3.0-or-later

"""A minimal, fully read-only template implementing ``app.connectors.base.Connector``.

Copy this file as the starting point for a real institution that isn't
Moodle. Every method here returns data from the small in-memory fixture
below instead of making a network call, so this package is safe to install
and try as-is -- it never talks to any real server, never needs an
account, and cannot be pointed at one by configuration.

When adapting this for a real system:

* Replace ``_FAKE_COURSES`` and the bodies of the five methods with
  read-only calls to the target system's API (see ``docs/PLUGINS.md`` for
  the safety rules -- no MFA/CAPTCHA bypass, no writes, sequential and
  gentle polling).
* Keep the method signatures and the ``name`` attribute: they are exactly
  what ``app.connectors.plugins.load_connector_plugins`` checks for.
* Write tests against a local fake HTTP server (see
  ``tests/fake_servers`` in the main repository for the pattern), never
  against the real institution.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.connectors.sdk import (
    ConnectorAuth,
    ConnectorContext,
    ConnectorStatus,
    RemoteAssignment,
    RemoteCourse,
    RemoteEvent,
    RemoteResource,
    RemoteSection,
    Snapshot,
)


@dataclass(frozen=True)
class _FakeFile:
    key: str
    name: str
    content: bytes


@dataclass(frozen=True)
class _FakeCourse:
    key: str
    name: str
    short_name: str
    section_key: str
    section_name: str
    files: tuple[_FakeFile, ...] = field(default_factory=tuple)
    assignment_title: str | None = None


# A tiny, entirely fictitious timetable. Real institution data never
# belongs here or in any fixture shipped with this template -- see
# AGENTS.md in the main repository.
_FAKE_COURSES: tuple[_FakeCourse, ...] = (
    _FakeCourse(
        key="course-1", name="Einführung in die Informatik", short_name="Info 1",
        section_key="woche-1", section_name="Woche 1",
        files=(_FakeFile(key="course-1/skript.pdf", name="Skript.pdf",
                         content=b"%PDF-1.4 Beispielinhalt des Vorlagen-Connectors"),),
        assignment_title="Übungsblatt 1",
    ),
)


def _fake_resource(course: _FakeCourse, item: _FakeFile) -> RemoteResource:
    return RemoteResource(key=item.key, name=item.name,
                          url=f"https://example.invalid/{item.key}",
                          kind="file", section_key=course.section_key, size=len(item.content))


def _fake_course(course: _FakeCourse) -> RemoteCourse:
    assignments = ([RemoteAssignment(key=f"{course.key}/aufgabe-1", title=course.assignment_title,
                                     due_timestamp=None, url=None)]
                   if course.assignment_title else [])
    return RemoteCourse(
        key=course.key, name=course.name, short_name=course.short_name,
        sections=[RemoteSection(key=course.section_key, name=course.section_name, position=1)],
        resources=[_fake_resource(course, item) for item in course.files],
        assignments=assignments,
    )


class ExampleUniversityConnector:
    """Read-only template connector; see the module docstring for how to adapt it."""

    name = "example_university"

    def __init__(self, context: ConnectorContext) -> None:
        self.context = context

    def check_auth(self) -> ConnectorAuth:
        return ConnectorAuth(account_id="example-student", capabilities=frozenset({"courses.read", "materials.read"}))

    def list_courses(self) -> list[RemoteCourse]:
        return [_fake_course(course) for course in _FAKE_COURSES]

    def fetch_changes(self, since: int | None = None) -> Snapshot:
        return Snapshot(
            courses=self.list_courses(),
            events=[RemoteEvent(key="course-1/vorlesung-1", title="Vorlesung: Einführung",
                                starts_timestamp=1_700_000_000, ends_timestamp=1_700_003_600,
                                url=None, course_key="course-1")],
            warnings=[],
            assignments_complete=True,
        )

    def download(self, resource: RemoteResource) -> bytes:
        for course in _FAKE_COURSES:
            for item in course.files:
                if item.key == resource.key:
                    return item.content
        raise ValueError(f"Unbekannte Beispiel-Ressource: {resource.key}")

    def health(self) -> ConnectorStatus:
        return ConnectorStatus(status="ok", message="Vorlagen-Connector: keine echte Verbindung")
