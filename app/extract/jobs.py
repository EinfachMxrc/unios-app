# SPDX-License-Identifier: AGPL-3.0-or-later

"""Bounded, single-worker indexing; originals survive cancellation and failures."""

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty, Full, Queue

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.orm import aliased

from app.config import Settings
from app.db.models import Resource, ResourceText, ResourceVersion
from app.deadline_proposals.service import stage_document_date
from app.extract.isolated import ParserCancelled, parse_path
from app.extract.limits import input_limit
from app.extract.service import TEXT_SUFFIXES
from app.host.lease import HostCoordinator
from app.material.preview import source_path

SUPPORTED = TEXT_SUFFIXES | {".pdf", ".docx", ".pptx"}
log = logging.getLogger(__name__)


@dataclass
class IndexJob:
    version_id: int
    generation: int = 0
    state: str = "queued"
    completed: int = 0
    total: int = 0
    error_code: str | None = None
    cancel: threading.Event = field(default_factory=threading.Event)

    def view(self) -> dict:
        return {"version_id": self.version_id, "state": self.state,
                "completed": self.completed, "total": self.total, "error_code": self.error_code}


class IndexJobs:
    def __init__(self, factory, settings: Settings, coordinator: HostCoordinator) -> None:
        self.factory, self.settings, self.coordinator = factory, settings, coordinator
        self.jobs: dict[int, IndexJob] = {}
        # Versions whose indexing failed, was cancelled or produced no text. Discovery leaves
        # them alone for this process; only an explicit submit() tries again.
        self.settled: set[int] = set()
        self.queue: Queue[int] = Queue(maxsize=64)
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.discover = False

    def start(self, *, discover: bool = False) -> None:
        with self.lock:
            self.discover = self.discover or discover
            if self.thread is None:
                self.thread = threading.Thread(target=self._run, name="unios-index", daemon=True)
                self.thread.start()

    def close(self) -> None:
        self.stop_event.set()
        with self.lock:
            for job in self.jobs.values():
                job.cancel.set()
        if self.thread:
            self.thread.join(timeout=5)

    def latest(self, resource_id: int) -> ResourceVersion:
        with self.factory() as session:
            version = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource_id)
                                     .order_by(ResourceVersion.version.desc()).limit(1))
            if version is None:
                raise HTTPException(404, "Materialversion nicht gefunden")
            return version

    def status(self, resource_id: int) -> dict:
        version = self.latest(resource_id)
        with self.lock:
            if version.id in self.jobs:
                return self.jobs[version.id].view()
        with self.factory() as session:
            indexed = session.scalar(select(ResourceText.id).where(ResourceText.version_id == version.id).limit(1))
        return {"version_id": version.id, "state": "indexed" if indexed else "not_indexed",
                "completed": 0, "total": 0, "error_code": None}

    def submit(self, resource_id: int) -> dict:
        self.coordinator.assert_writer()
        version = self.latest(resource_id)
        path = source_path(self.settings.data_dir, version)
        if path.suffix.lower() not in SUPPORTED or path.stat().st_size > input_limit(path.suffix, version.mime_type):
            raise HTTPException(422, "Dateiformat oder Größe wird für den Textindex nicht unterstützt")
        with self.lock:
            current = self.jobs.get(version.id)
            if current and current.state in {"queued", "running", "cancelling"}:
                return current.view()
            # Completed progress is ephemeral; keep memory bounded in long-running servers.
            if len(self.jobs) >= 256:
                for key in list(self.jobs):
                    if self.jobs[key].state not in {"queued", "running", "cancelling"}:
                        # Forgetting a failed or empty result would make discovery queue it again.
                        self.settled.add(key)
                        del self.jobs[key]
                        if len(self.jobs) < 256:
                            break
            lease = self.coordinator.current()
            if lease is None:
                raise HTTPException(423, "Hauptgerät nicht verfügbar")
            job = IndexJob(version.id, generation=lease.generation)
            try:
                self.queue.put_nowait(version.id)
            except Full:
                raise HTTPException(429, "Textindex-Warteschlange ist voll") from None
            self.jobs[version.id] = job
            self.settled.discard(version.id)
            self.start()
            return job.view()

    def cancel(self, resource_id: int) -> dict:
        self.coordinator.assert_writer()
        version = self.latest(resource_id)
        with self.lock:
            job = self.jobs.get(version.id)
            if job and job.state in {"queued", "running", "cancelling"}:
                job.cancel.set()
                job.state = "cancelling"
        return self.status(resource_id)

    def _discover(self) -> None:
        if not self.coordinator.is_writer:
            return
        with self.lock:
            known = [*self.jobs, *self.settled]
        with self.factory() as session:
            newer = aliased(ResourceVersion)
            rows = session.scalars(select(ResourceVersion).where(
                ~exists(select(ResourceText.id).where(ResourceText.version_id == ResourceVersion.id)),
                ResourceVersion.id.not_in(known),
                ~exists(select(newer.id).where(newer.resource_id == ResourceVersion.resource_id,
                                               newer.version > ResourceVersion.version)),
            ).order_by(ResourceVersion.id.desc()).limit(256)).all()
        for version in rows:
            with self.lock:
                if version.id in self.jobs:
                    continue  # Cancelled/failed work requires an explicit retry during this process.
            if Path(version.relative_path).suffix.lower() in SUPPORTED:
                try:
                    self.submit(version.resource_id)
                except HTTPException as exc:
                    if exc.status_code == 422:  # unsupported or too large: will not change by waiting
                        with self.lock:
                            self.settled.add(version.id)
                except (OSError, ValueError):
                    continue

    def _run(self) -> None:
        while not self.stop_event.is_set():
            try:
                version_id = self.queue.get(timeout=2)
            except Empty:
                if self.discover:
                    try:
                        self._discover()
                    except Exception:  # noqa: BLE001 - keep the bounded worker available after a transient DB/host failure
                        log.warning("Textindex-Erkennung vorübergehend nicht verfügbar")
                continue
            with self.lock:
                job = self.jobs[version_id]
            try:
                self._index(job)
            except Exception:  # noqa: BLE001 - an unreadable file must not terminate the queue worker
                job.state, job.error_code = "failed", "INDEX_FAILED"
            finally:
                self.queue.task_done()

    def _index(self, job: IndexJob) -> None:
        if job.cancel.is_set():
            job.state = "cancelled"
            return
        self.coordinator.assert_writer()
        job.state = "running"
        with self.factory() as session:
            version = session.get(ResourceVersion, job.version_id)
            if version is None:
                raise LookupError("Version fehlt")
            path = source_path(self.settings.data_dir, version)
            if path.stat().st_size > input_limit(path.suffix, version.mime_type):
                raise ValueError("Datei zu groß")
        def progress(done, total):
            job.completed, job.total = done, total
        try:
            pages = parse_path(path, path.name, version.mime_type, cancel=job.cancel.is_set,
                               check=self.coordinator.assert_writer, progress=progress)
        except ParserCancelled:
            job.state = 'cancelled'
            return
        with self.factory() as session:
            version = session.get(ResourceVersion, job.version_id)
            if version is None:
                raise LookupError('Version fehlt')
            if job.cancel.is_set():
                job.state = "cancelled"
                return
            # Publish atomically: readers retain the previous index until all pages succeed.
            existing = {page.page_number: page for page in session.scalars(
                select(ResourceText).where(ResourceText.version_id == version.id)).all()}
            for page in pages:
                stored = existing.get(page.number)
                if stored is None:
                    session.add(ResourceText(version_id=version.id, page_number=page.number,
                                             text=page.text, markdown=page.markdown, no_text_layer=page.no_text_layer))
                elif stored.ocr_attempted_at is None or page.text:
                    stored.text, stored.markdown, stored.no_text_layer = page.text, page.markdown, page.no_text_layer
            resource = session.get(Resource, version.resource_id)
            if resource is not None and resource.group_category != "other_group":
                session.flush()
                stage_document_date(session, resource, version)
            self.coordinator.assert_writer()
            lease = self.coordinator.current()
            if lease is None or lease.generation != job.generation:
                raise RuntimeError("Host-Generation hat sich während der Verarbeitung geändert")
            if job.cancel.is_set():
                job.state = "cancelled"
                return
            session.commit()
        if not pages:
            # An empty document has no text rows, so discovery would otherwise find it again.
            with self.lock:
                self.settled.add(job.version_id)
        job.state = "completed"
