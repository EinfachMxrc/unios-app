# SPDX-License-Identifier: AGPL-3.0-or-later

"""Import files placed by the user in the shared drop folder."""

import logging
import os
import stat
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.config import Settings
from app.db.models import (
    Course,
    CourseSection,
    Resource,
    ResourceVersion,
    Semester,
    utc_now,
)
from app.extract.service import index_version
from app.files.localpath import resolve_local
from app.files.sidecars import (
    metadata_for,
    resource_state_for,
    write_file_state_sidecar,
    write_sidecar,
)
from app.files.store import FileStore, content_type
from app.host.lease import HostCoordinator

log = logging.getLogger(__name__)
MAX_DROP_SIZE = 512 * 1024 * 1024


class DropFileView(BaseModel):
    name: str
    size: int
    modified_at: datetime
    imported: bool
    course_id: int | None


class DropView(BaseModel):
    folder: str
    files: list[DropFileView]


class DropAssignment(BaseModel):
    course_id: int
    section_id: int | None = None


class DropImportView(BaseModel):
    resource_id: int
    version_id: int
    version: int
    created_version: bool


def _drop_dir(settings: Settings) -> Path:
    folder = settings.data_dir / "drop"
    if folder.is_symlink() or (folder.exists() and not resolve_local(folder).is_relative_to(resolve_local(settings.data_dir))):
        raise HTTPException(409, "Drop-Ordner ist kein sicherer Ordner")
    if folder.exists() and not folder.is_dir():
        raise HTTPException(409, "Drop-Ordner ist kein Ordner")
    return folder


def _filename(name: str) -> str:
    if (name in {".", ".."} or Path(name).name != name or "\\" in name
            or not name or name.startswith(".")):
        raise HTTPException(400, "Ungültiger Dateiname")
    return name


def _read_stable_file(path: Path) -> tuple[bytes, os.stat_result]:
    if path.is_symlink():
        raise HTTPException(400, "Symbolische Links können nicht importiert werden")
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise HTTPException(400, "Nur reguläre Dateien können importiert werden")
            if before.st_size > MAX_DROP_SIZE:
                raise HTTPException(413, "Datei ist größer als 512 MB")
            data = stream.read(MAX_DROP_SIZE + 1)
            after = os.fstat(stream.fileno())
        if len(data) > MAX_DROP_SIZE:
            raise HTTPException(413, "Datei ist größer als 512 MB")
        current = os.stat(path, follow_symlinks=False)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
        ) or (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (
            current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns
        ):
            raise HTTPException(409, "Datei wird noch geändert; bitte später erneut versuchen")
        return data, after
    except FileNotFoundError:
        raise HTTPException(404, "Datei nicht gefunden") from None
    except OSError as exc:
        log.warning("Drop-Datei konnte nicht geöffnet werden: %s", type(exc).__name__)
        raise HTTPException(400, "Datei konnte nicht geöffnet werden") from None


def drop_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/drop")
    store = FileStore(settings.data_dir)

    @router.get("", response_model=DropView)
    def list_files():
        folder = _drop_dir(settings)
        if not folder.exists():
            return DropView(folder=str(folder), files=[])
        files: list[DropFileView] = []
        with factory() as session:
            for path in sorted(folder.iterdir(), key=lambda item: item.name.casefold()):
                if path.name.startswith(".") or path.is_symlink() or not path.is_file():
                    continue
                try:
                    details = path.stat()
                except FileNotFoundError:
                    continue
                resource = session.scalar(select(Resource).where(Resource.source == "manual",
                                                                  Resource.source_key == path.name))
                imported = bool(resource and resource.upstream_modified == details.st_mtime_ns
                                and resource.upstream_size == details.st_size)
                files.append(DropFileView(name=path.name, size=details.st_size,
                                          modified_at=datetime.fromtimestamp(details.st_mtime, UTC),
                                          imported=imported, course_id=resource.course_id if resource else None))
        return DropView(folder=str(folder), files=files)

    @router.post("/{name}/assign", response_model=DropImportView)
    def assign_file(name: str, payload: DropAssignment):
        coordinator.assert_writer()
        folder = _drop_dir(settings)
        name = _filename(name)
        path = folder / name
        data, details = _read_stable_file(path)
        digest = FileStore.digest(data)
        with factory() as session:
            course = session.get(Course, payload.course_id)
            if course is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            section = session.get(CourseSection, payload.section_id) if payload.section_id else None
            if payload.section_id and (section is None or section.course_id != course.id):
                raise HTTPException(400, "Abschnitt gehört nicht zum Kurs")
            resource = session.scalar(select(Resource).where(Resource.source == "manual",
                                                              Resource.source_key == name))
            if resource is None:
                resource = Resource(source="manual", source_key=name, course_id=course.id,
                                    section_id=section.id if section else None, kind="file", name=name,
                                    url="", upstream_modified=details.st_mtime_ns,
                                    upstream_size=details.st_size, last_seen_at=utc_now())
                session.add(resource)
                session.flush()
            else:
                resource.course_id = course.id
                resource.section_id = section.id if section else None
                resource.upstream_modified = details.st_mtime_ns
                resource.upstream_size = details.st_size
                resource.last_seen_at = utc_now()
            latest = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                                    .order_by(ResourceVersion.version.desc()))
            if latest and latest.sha256 == digest:
                if not (settings.data_dir / latest.relative_path).is_file():
                    raise HTTPException(409, "Gespeicherte Dateiversion fehlt; bitte Backup prüfen")
                write_file_state_sidecar(settings.data_dir, resource_state_for(session, resource))
                session.commit()
                return DropImportView(resource_id=resource.id, version_id=latest.id,
                                      version=latest.version, created_version=False)
            semester = session.get(Semester, course.semester_id) if course.semester_id else None
            same_hash = session.scalar(select(ResourceVersion).where(ResourceVersion.sha256 == digest).limit(1))
            existing_path = settings.data_dir / same_hash.relative_path if same_hash else None
            if existing_path is not None and not existing_path.is_file():
                existing_path = None
            number = latest.version + 1 if latest else 1
            relative_path = store.save(data, semester.name if semester else settings.current_semester_name,
                                       course.name, section.name if section else "Sonstiges", name, number,
                                       digest, utc_now(), "manual", name, existing_path)
            version = ResourceVersion(resource_id=resource.id, version=number, sha256=digest,
                                      relative_path=str(relative_path), size=len(data),
                                      mime_type=content_type(data, name))
            session.add(version)
            session.flush()
            write_sidecar(settings.data_dir, metadata_for(session, resource, version))
            write_file_state_sidecar(settings.data_dir, resource_state_for(session, resource))
            try:
                index_version(session, version, data, name)
            except Exception as exc:  # noqa: BLE001 - unsupported formats remain downloadable
                log.warning("Textextraktion fehlgeschlagen für manuelle Datei: %s", type(exc).__name__)
            session.commit()
            return DropImportView(resource_id=resource.id, version_id=version.id,
                                  version=number, created_version=True)

    return router
