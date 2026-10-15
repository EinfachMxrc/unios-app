# SPDX-License-Identifier: AGPL-3.0-or-later
"""Transactional storage for manual card identity and frozen source snapshots."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from filelock import FileLock
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    Course,
    MaterialAnnotation,
    Resource,
    ResourceVersion,
)
from app.db.session import begin_write_transaction
from app.files.atomic import ensure_directory
from app.host.lease import HostCoordinator
from app.learning.topics import resolve_topic
from app.material.service import display


@dataclass(frozen=True)
class ManualCardRecord:
    queue_id: int
    origin: str
    mutation_id: str | None
    status: str
    payload: str
    source_snapshot: dict[str, Any] | None
    note_id: int | None


@dataclass(frozen=True)
class ManualSourceRecords:
    version: ResourceVersion | None
    resource: Resource | None
    course: Course | None
    annotation: MaterialAnnotation | None


class ManualCardTransaction:
    def __init__(self, session: Session, settings: Settings, coordinator: HostCoordinator):
        self._session = session
        self._settings = settings
        self._coordinator = coordinator

    def by_mutation(self, mutation_id: str) -> ManualCardRecord | None:
        return self._record(AnkiCardQueue.mutation_id == mutation_id)

    def by_id(self, queue_id: int) -> ManualCardRecord | None:
        return self._record(AnkiCardQueue.id == queue_id)

    def _record(self, condition) -> ManualCardRecord | None:
        row = self._session.execute(select(AnkiCardQueue, AnkiCard.note_id)
            .outerjoin(AnkiCard, AnkiCard.queue_id == AnkiCardQueue.id).where(condition)).first()
        if row is None:
            return None
        item, note_id = row
        return ManualCardRecord(item.id, item.origin, item.mutation_id, item.status, item.payload,
                                deepcopy(item.source_snapshot), int(note_id) if note_id is not None else None)

    def source(self, version_id: int, annotation_id: str) -> ManualSourceRecords:
        version = self._session.get(ResourceVersion, version_id)
        resource = self._session.get(Resource, version.resource_id) if version is not None else None
        course = self._session.get(Course, resource.course_id) if resource is not None else None
        annotation = self._session.get(MaterialAnnotation, annotation_id)
        if annotation is not None:
            self._session.refresh(annotation)
        return ManualSourceRecords(version, resource, course, annotation)

    def displayed_source(self, source: ManualSourceRecords) -> dict[str, Any]:
        assert source.version is not None and source.annotation is not None
        return display(self._session, self._settings.data_dir, source.version, source.annotation, locked=True)

    def save(self, *, resource_id: int | None, version_id: int | None, mutation_id: str, course_id: int,
             topic: str, payload: str, snapshot: dict[str, Any]) -> ManualCardRecord:
        topic_id = resolve_topic(self._session, course_id, topic).id
        item = AnkiCardQueue(resource_id=resource_id, status="approved", origin="manual",
                             mutation_id=mutation_id, source_version_id=version_id,
                             source_snapshot=snapshot, payload=payload, topic_id=topic_id)
        self._session.add(item)
        self._session.flush()
        self._coordinator.assert_writer()
        self._session.commit()
        return ManualCardRecord(item.id, item.origin, item.mutation_id, item.status, item.payload,
                                deepcopy(item.source_snapshot), None)


class ManualCardRepository:
    def __init__(self, settings: Settings, factory: Callable[[], Session], coordinator: HostCoordinator):
        self._settings = settings
        self._factory = factory
        self._coordinator = coordinator

    @contextmanager
    def read(self) -> Iterator[ManualCardTransaction]:
        with self._factory() as session:
            yield ManualCardTransaction(session, self._settings, self._coordinator)

    @contextmanager
    def write_for_source(self, resource_id: int) -> Iterator[ManualCardTransaction]:
        self._coordinator.assert_writer()
        folder = ensure_directory(self._settings.data_dir / "annotations" / "locks")
        # Use the same lock as annotation updates/reanchor, then start a fresh
        # transaction. No earlier read snapshot can be promoted into a writer.
        with FileLock(folder / f"{resource_id}.lock", timeout=5), self._factory() as session:
            self._coordinator.assert_writer()
            begin_write_transaction(session)
            yield ManualCardTransaction(session, self._settings, self._coordinator)
