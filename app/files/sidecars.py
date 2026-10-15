# SPDX-License-Identifier: AGPL-3.0-or-later

"""Immutable sidecar metadata for rebuilding downloaded resource versions."""
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Literal, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.db.models import (
    Course,
    CourseSection,
    Resource,
    ResourceVersion,
    SectionGroupAssignment,
    Semester,
)
from app.files.atomic import ensure_directory, write_once
from app.files.localpath import native_path, resolve_local
from app.health.logging import redact_sensitive

SENSITIVE_QUERY_KEYS = {
    "session", "sesskey", "user", "token", "wstoken", "access_token", "id_token",
    "oauth_token", "password", "api_key", "api-key",
}


def without_sensitive_query(url: str) -> str:
    parsed = urlsplit(url)
    query = urlencode([(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                       if key.lower() not in SENSITIVE_QUERY_KEYS])
    return urlunsplit(parsed._replace(query=query, fragment=""))


def safe_external_url(value: object, *, allow_http: bool = False) -> str | None:
    """Keep browser-facing links usable without exposing credentials or unsafe schemes."""
    if not isinstance(value, str) or not value or any(ord(char) < 33 for char in value):
        return None
    try:
        parsed = urlsplit(value)
        if (parsed.scheme not in ({"http", "https"} if allow_http else {"https"})
                or not parsed.hostname or parsed.username is not None or parsed.password is not None):
            return None
        _ = parsed.port  # Reject malformed ports before a URL reaches a browser.
        return without_sensitive_query(value)
    except ValueError:
        return None


class SidecarV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    source: str
    source_key: str
    course_source_id: str
    course_source: str | None = None
    course_name: str
    course_short_name: str | None = None
    semester_name: str
    section_source_id: str | None = None
    section_name: str | None = None
    resource_name: str
    resource_url: str
    relative_path: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    size: int = Field(ge=0)
    mime_type: str
    version: int = Field(ge=1)
    downloaded_at: datetime
    upstream_modified: int | None = None
    upstream_size: int | None = None
    group_category: Literal["general", "own_group", "other_group", "unassigned"] = "general"


class ResourceStateSidecarV1(BaseModel):
    """Immutable current metadata for a link or downloaded file."""

    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    source: str
    source_key: str
    course_source_id: str
    course_source: str | None = None
    course_name: str
    course_short_name: str | None = None
    semester_name: str
    section_source_id: str | None = None
    section_name: str | None = None
    resource_name: str
    resource_url: str
    observed_at: datetime
    upstream_modified: int | None = None
    upstream_size: int | None = None
    group_category: Literal["general", "own_group", "other_group", "unassigned"] = "general"
    removed_upstream: bool = False
    course_download_other_groups: bool | None = None
    section_group_needs_confirmation: bool | None = None


def _under_uni(data_dir: Path, relative_path: str) -> Path:
    root = resolve_local(data_dir / "uni")
    path = resolve_local(data_dir / relative_path)
    if not path.is_relative_to(root):
        raise ValueError("Dateiversion liegt außerhalb des Uni-Ordners")
    return path


def write_sidecar(data_dir: Path, metadata: SidecarV1) -> Path:
    document = _under_uni(data_dir, metadata.relative_path)
    if not native_path(document).is_file():
        raise FileNotFoundError("Dateiversion für Sidecar fehlt")
    target = document.with_name(document.name + ".unios.json")
    physical = native_path(target)
    content = metadata.model_dump_json(indent=2).encode("utf-8") + b"\n"
    if physical.is_file() and not physical.is_symlink():
        # A sync that was rolled back leaves its files behind; the retry stores the same
        # file again with a new download time. Only a different file may not replace it.
        try:
            previous = SidecarV1.model_validate_json(physical.read_text(encoding="utf-8"))
        except ValueError:
            previous = None
        if previous is not None and (previous.model_dump(exclude={"downloaded_at"})
                                     == metadata.model_dump(exclude={"downloaded_at"})):
            return target
    return write_once(target, content)


def metadata_for(session, resource: Resource, version: ResourceVersion) -> SidecarV1:
    if redact_sensitive(resource.source_key) != resource.source_key:
        raise ValueError("Quellschlüssel enthält Session- oder Tokenparameter")
    course = session.get(Course, resource.course_id)
    semester = session.get(Semester, course.semester_id) if course.semester_id else None
    section = session.get(CourseSection, resource.section_id) if resource.section_id else None
    return SidecarV1(
        source=resource.source, source_key=resource.source_key,
        course_source_id=course.source_id, course_source=course.source, course_name=course.name,
        course_short_name=course.short_name, semester_name=semester.name if semester else "Semester_1",
        section_source_id=section.source_id if section else None,
        section_name=section.name if section else None,
        resource_name=resource.name, resource_url=without_sensitive_query(resource.url),
        relative_path=version.relative_path, sha256=version.sha256, size=version.size,
        mime_type=version.mime_type, version=version.version,
        downloaded_at=version.downloaded_at, upstream_modified=resource.upstream_modified,
        upstream_size=resource.upstream_size,
        group_category=cast(Literal["general", "own_group", "other_group", "unassigned"], resource.group_category),
    )


def resource_state_for(session, resource: Resource, observed_at: datetime | None = None) -> ResourceStateSidecarV1:
    if resource.kind not in {"link", "file"}:
        raise ValueError("Metadaten-Sidecar benötigt eine Datei oder einen Link")
    if redact_sensitive(resource.source_key) != resource.source_key:
        raise ValueError("Quellschlüssel enthält Session- oder Tokenparameter")
    course = session.get(Course, resource.course_id)
    semester = session.get(Semester, course.semester_id) if course.semester_id else None
    section = session.get(CourseSection, resource.section_id) if resource.section_id else None
    assignment = session.scalar(select(SectionGroupAssignment).where(
        SectionGroupAssignment.section_id == section.id)) if section else None
    return ResourceStateSidecarV1(
        source=resource.source, source_key=resource.source_key,
        course_source_id=course.source_id, course_source=course.source, course_name=course.name,
        course_short_name=course.short_name, semester_name=semester.name if semester else "Semester_1",
        section_source_id=section.source_id if section else None,
        section_name=section.name if section else None,
        resource_name=resource.name, resource_url=without_sensitive_query(resource.url),
        observed_at=observed_at or resource.last_seen_at, upstream_modified=resource.upstream_modified,
        upstream_size=resource.upstream_size,
        group_category=cast(Literal["general", "own_group", "other_group", "unassigned"], resource.group_category),
        removed_upstream=resource.removed_upstream,
        course_download_other_groups=course.download_other_groups,
        section_group_needs_confirmation=assignment.needs_confirmation if assignment else None,
    )


def _write_state_sidecar(data_dir: Path, metadata: ResourceStateSidecarV1, folder: str, suffix: str) -> Path:
    """Append changed metadata while keeping earlier states recoverable."""
    identifier = hashlib.sha256(f"{metadata.source}\0{metadata.source_key}".encode()).hexdigest()
    directory = ensure_directory(data_dir / "uni", folder, identifier)
    # Enumerate through the native path, but preserve portable/logical return
    # paths so Windows' extended prefix never becomes archive metadata.
    previous = sorted(directory / path.name for path in native_path(directory).glob(f"*.{suffix}"))
    if previous:
        last = ResourceStateSidecarV1.model_validate_json(native_path(previous[-1]).read_text(encoding="utf-8"))
        if last.model_dump(exclude={"observed_at"}) == metadata.model_dump(exclude={"observed_at"}):
            return previous[-1]
    content = metadata.model_dump_json(indent=2).encode("utf-8") + b"\n"
    digest = hashlib.sha256(content).hexdigest()[:16]
    target = directory / f"{metadata.observed_at:%Y%m%dT%H%M%S%fZ}_{digest}.{suffix}"
    return write_once(target, content)


def write_link_sidecar(data_dir: Path, metadata: ResourceStateSidecarV1) -> Path:
    return _write_state_sidecar(data_dir, metadata, "_links", "unios-link.json")


def write_file_state_sidecar(data_dir: Path, metadata: ResourceStateSidecarV1) -> Path:
    return _write_state_sidecar(data_dir, metadata, "_file_states", "unios-file.json")


def _restore_location(session, metadata: SidecarV1 | ResourceStateSidecarV1,
                      update_existing: bool = False) -> tuple[Course, CourseSection | None]:
    semester = session.scalar(select(Semester).where(Semester.name == metadata.semester_name))
    if semester is None:
        has_current = session.scalar(select(Semester.id).where(Semester.is_current.is_(True)).limit(1))
        semester = Semester(name=metadata.semester_name, is_current=has_current is None)
        session.add(semester)
        session.flush()
    course = session.scalar(select(Course).where(Course.source == (metadata.course_source or metadata.source),
                                                  Course.source_id == metadata.course_source_id))
    if course is None:
        course = Course(source=metadata.course_source or metadata.source, source_id=metadata.course_source_id,
                        name=metadata.course_name, short_name=metadata.course_short_name,
                        semester_id=semester.id)
        session.add(course)
        session.flush()
    elif update_existing:
        course.name = metadata.course_name
        course.short_name = metadata.course_short_name
        course.semester_id = semester.id
    if (update_existing and isinstance(metadata, ResourceStateSidecarV1)
            and metadata.course_download_other_groups is not None):
        course.download_other_groups = metadata.course_download_other_groups
    section = None
    if metadata.section_source_id:
        section = session.scalar(select(CourseSection).where(CourseSection.course_id == course.id,
                                                              CourseSection.source_id == metadata.section_source_id))
        if section is None:
            section = CourseSection(course_id=course.id, source_id=metadata.section_source_id,
                                    name=metadata.section_name or "Sonstiges")
            session.add(section)
            session.flush()
        elif update_existing:
            section.name = metadata.section_name or "Sonstiges"
        if metadata.group_category in {"own_group", "other_group"} and not session.scalar(
            select(SectionGroupAssignment).where(SectionGroupAssignment.section_id == section.id)
        ):
            session.add(SectionGroupAssignment(section_id=section.id, status=metadata.group_category,
                                               suggested_status=None, needs_confirmation=True))
        if (update_existing and isinstance(metadata, ResourceStateSidecarV1)
                and metadata.section_group_needs_confirmation is not None):
            assignment = session.scalar(select(SectionGroupAssignment).where(
                SectionGroupAssignment.section_id == section.id))
            if assignment is None:
                assignment = SectionGroupAssignment(section_id=section.id)
                session.add(assignment)
            assignment.status = metadata.group_category
            assignment.needs_confirmation = metadata.section_group_needs_confirmation
            assignment.updated_at = metadata.observed_at
    return course, section


def _latest_states(data_dir: Path, folder: str, suffix: str) -> dict[tuple[str, str], ResourceStateSidecarV1]:
    latest: dict[tuple[str, str], ResourceStateSidecarV1] = {}
    for sidecar_path in native_path(data_dir / "uni" / folder).rglob(f"*.{suffix}"):
        content = native_path(sidecar_path).read_bytes()
        metadata = ResourceStateSidecarV1.model_validate_json(content)
        identifier = hashlib.sha256(f"{metadata.source}\0{metadata.source_key}".encode()).hexdigest()
        digest = hashlib.sha256(content).hexdigest()[:16]
        if (resolve_local(sidecar_path).parent != resolve_local(data_dir / "uni" / folder / identifier)
                or not sidecar_path.name.endswith(f"_{digest}.{suffix}")):
            raise ValueError("Metadaten-Sidecar-Pfad stimmt nicht mit Inhalt überein")
        key = metadata.source, metadata.source_key
        if key not in latest or metadata.observed_at > latest[key].observed_at:
            latest[key] = metadata
    return latest


def rebuild_index(factory, data_dir: Path) -> dict[str, int]:
    """Recreate resources and versions from verified sidecars without touching documents."""
    sidecars = sorted(native_path(data_dir / "uni").rglob("*.unios.json"))
    created_resources = 0
    created_versions = 0
    with factory() as session:
        for sidecar_path in sidecars:
            metadata = SidecarV1.model_validate_json(native_path(sidecar_path).read_text(encoding="utf-8"))
            document = _under_uni(data_dir, metadata.relative_path)
            if resolve_local(sidecar_path) != resolve_local(document.with_name(document.name + ".unios.json")):
                raise ValueError("Sidecar-Pfad stimmt nicht mit Metadaten überein")
            physical_document = native_path(document)
            with physical_document.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != metadata.sha256 or physical_document.stat().st_size != metadata.size:
                raise ValueError(f"Dateiprüfsumme stimmt nicht: {metadata.relative_path}")
            course, section = _restore_location(session, metadata)
            resource = session.scalar(select(Resource).where(Resource.source == metadata.source,
                                                              Resource.source_key == metadata.source_key))
            if resource is None:
                resource = Resource(source=metadata.source, source_key=metadata.source_key,
                                    course_id=course.id, section_id=section.id if section else None,
                                    kind="file", name=metadata.resource_name, url=metadata.resource_url,
                                    group_category=metadata.group_category,
                                    upstream_modified=metadata.upstream_modified, upstream_size=metadata.upstream_size)
                session.add(resource)
                session.flush()
                created_resources += 1
            version = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id,
                                                                    ResourceVersion.version == metadata.version))
            if version is None:
                session.add(ResourceVersion(resource_id=resource.id, version=metadata.version,
                                            sha256=metadata.sha256, relative_path=metadata.relative_path,
                                            size=metadata.size, mime_type=metadata.mime_type,
                                            downloaded_at=metadata.downloaded_at))
                created_versions += 1
            elif version.sha256 != metadata.sha256 or version.relative_path != metadata.relative_path:
                raise ValueError("Index und Sidecar widersprechen sich")
        states = [
            (state, kind)
            for folder, suffix, kind in (("_links", "unios-link.json", "link"),
                                         ("_file_states", "unios-file.json", "file"))
            for state in _latest_states(data_dir, folder, suffix).values()
        ]
        for state_metadata, kind in sorted(states, key=lambda item: item[0].observed_at):
            course, section = _restore_location(session, state_metadata, update_existing=True)
            resource = session.scalar(select(Resource).where(Resource.source == state_metadata.source,
                                                              Resource.source_key == state_metadata.source_key))
            if resource is None and kind == "file":
                raise ValueError("Datei-Metadaten ohne Dateiversion")
            if resource is None:
                resource = Resource(source=state_metadata.source, source_key=state_metadata.source_key,
                                    course_id=course.id, kind="link", name=state_metadata.resource_name,
                                    url=state_metadata.resource_url)
                session.add(resource)
                created_resources += 1
            elif resource.kind != kind:
                raise ValueError("Index und Metadaten-Sidecar widersprechen sich")
            resource.course_id = course.id
            resource.section_id = section.id if section else None
            resource.name = state_metadata.resource_name
            resource.url = state_metadata.resource_url
            resource.group_category = state_metadata.group_category
            resource.upstream_modified = state_metadata.upstream_modified
            resource.upstream_size = state_metadata.upstream_size
            resource.removed_upstream = state_metadata.removed_upstream
        session.commit()
    return {"sidecars": len(sidecars), "resources_created": created_resources,
            "versions_created": created_versions}
