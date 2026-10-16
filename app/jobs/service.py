# SPDX-License-Identifier: AGPL-3.0-or-later

"""One bounded worker, durable states, cooperative cancellation and host fencing."""

import logging
import threading
from queue import Empty, Full, Queue
from uuid import uuid4

from fastapi import HTTPException

from app.db.models import BackgroundJob
from app.jobs.schema import JobRequest

log = logging.getLogger(__name__)


class JobCancelled(Exception):
    pass


def view(row):
    return {"id": row.id, "kind": row.kind, "target_id": row.target_id, "mode": row.mode,
            "state": row.state, "completed": row.completed, "total": row.total,
            "error_code": row.error_code, "created_at": row.created_at, "updated_at": row.updated_at,
            "retry_of": row.retry_of}


class JobContext:
    def __init__(self, service, row, cancel):
        self.service, self.row, self.cancel = service, row, cancel

    def check(self):
        if self.cancel.is_set() or self.service.stop.is_set():
            raise JobCancelled
        self.fence()

    def fence(self):
        self.service.coordinator.assert_writer()
        lease = self.service.coordinator.current()
        if lease is None or lease.generation != self.row.generation:
            raise HTTPException(409, "STALE_HOST")

    def progress(self, completed, total):
        self.check()
        self.service.repository.update(self.row.id, self.check, completed=completed, total=total)


class BackgroundJobs:
    def __init__(self, repository, coordinator, handlers):
        self.repository, self.coordinator, self.handlers = repository, coordinator, handlers
        self.queue: Queue[str] = Queue(maxsize=64)
        self.stop = threading.Event()
        self.lock = threading.RLock()
        self.cancels: dict[str, threading.Event] = {}
        self.thread = None
        self.initialized = False

    def start(self):
        with self.lock:
            if not self.initialized:
                self.repository.interrupt(self.coordinator.assert_writer)
                self.initialized = True
            if self.thread is None:
                self.thread = threading.Thread(target=self._run, daemon=True, name="unios-background")
                self.thread.start()

    def targets(self, kind, query):
        return self.repository.targets(kind, query)

    def list(self):
        return [view(row) for row in self.repository.list()]

    def submit(self, request: JobRequest, retry_of=None):
        self.coordinator.assert_writer()
        with self.lock:
            self.start()
            if self.queue.full():
                raise HTTPException(429, "Auftragswarteschlange ist voll")
            for existing in self.repository.list():
                if existing.kind == request.kind and existing.target_id == request.target_id and existing.mode == request.mode and existing.state in {"queued", "running", "cancelling"}:
                    return view(existing)
            lease = self.coordinator.current()
            row = BackgroundJob(id=str(uuid4()), kind=request.kind, target_id=request.target_id, mode=request.mode,
                                generation=lease.generation, state="queued", retry_of=retry_of)
            self.repository.insert(row, self.coordinator.assert_writer)
            self.cancels[row.id] = threading.Event()
            try:
                self.queue.put_nowait(row.id)
            except Full:
                self.repository.update(row.id, self.coordinator.assert_writer, state="failed", error_code="QUEUE_FULL")
                raise HTTPException(429, "Auftragswarteschlange ist voll") from None
            return view(row)

    def change(self, identifier, action):
        self.coordinator.assert_writer()
        row = self.repository.get(identifier)
        if row is None:
            raise HTTPException(404, "Auftrag nicht gefunden")
        if action == "retry":
            if row.state not in {"failed", "cancelled", "interrupted"}:
                raise HTTPException(409, "Auftrag ist nicht wiederholbar")
            return self.submit(JobRequest(kind=row.kind, target_id=row.target_id, mode=row.mode, confirmed=True), retry_of=row.id)
        if row.state not in {"queued", "running", "cancelling"}:
            raise HTTPException(409, "Auftrag ist bereits beendet")
        with self.lock:
            current = self.repository.get(identifier)
            if current.state not in {"queued", "running", "cancelling"}:
                raise HTTPException(409, "Auftrag ist bereits beendet")
            cancel = self.cancels.get(identifier)
            if cancel is None:
                raise HTTPException(409, "Auftrag stammt aus einem früheren Prozess")
            cancel.set()
            self.repository.update(identifier, self.coordinator.assert_writer, state="cancelling")
        return view(self.repository.get(identifier))

    def _run(self):
        while not self.stop.is_set():
            try:
                identifier = self.queue.get(timeout=.2)
            except Empty:
                continue
            context = None
            try:
                row = self.repository.get(identifier)
                if row is None:
                    raise ValueError("Missing job")
                context = JobContext(self, row, self.cancels[identifier])
                context.check()
                self.repository.update(identifier, context.check, state="running")
                self.handlers[row.kind](context)
                with self.lock:
                    context.check()
                    self.repository.update(identifier, context.check, state="completed")
            except JobCancelled:
                try:
                    if context is None:
                        log.warning("JOB_RESULT_DEFERRED")
                        continue
                    self.repository.update(identifier, context.fence, state="cancelled", error_code=None)
                except Exception:  # noqa: BLE001 - never write after losing ownership
                    log.warning("JOB_RESULT_DEFERRED")
            except Exception:  # noqa: BLE001 - never expose notes, paths, tokens or provider errors
                try:
                    if context is None:
                        log.warning("JOB_RESULT_DEFERRED")
                        continue
                    self.repository.update(identifier, context.fence, state="failed", error_code="JOB_FAILED")
                except Exception:  # noqa: BLE001 - a lost writer cannot publish final state
                    log.warning("JOB_RESULT_DEFERRED")
            finally:
                with self.lock:
                    self.cancels.pop(identifier, None)
                self.queue.task_done()

    def close(self):
        self.stop.set()
        for cancel in list(self.cancels.values()):
            cancel.set()
        if self.thread:
            self.thread.join(timeout=5)
