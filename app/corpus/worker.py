# SPDX-License-Identifier: AGPL-3.0-or-later
"""One resumable, fenced corpus worker; no extraction on retrieval requests."""

import threading


class CorpusWorker:
    def __init__(self, repository, coordinator):
        self.repository, self.coordinator = repository, coordinator
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.thread = None

    def start(self):
        if self.thread is None:
            self.thread = threading.Thread(target=self._run, daemon=True, name='unios-corpus')
            self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=5)

    def drain(self, check=None, progress=None):
        guard = check or self.coordinator.assert_writer
        completed = 0
        while not self.lock.acquire(timeout=0.2):
            guard()
            if self.stop.is_set():
                return 0
        try:
            total = self.repository.status()['pending']
            while not self.stop.is_set():
                guard()
                rows = self.repository.dirty()
                if not rows:
                    break
                row = rows[0]
                try:
                    self.repository.publish(row['entity_ref'], row['generation'], guard)
                except Exception:  # noqa: BLE001 -- isolate a malformed source without retaining its text
                    guard()  # Cancellation/lease loss must propagate, never become a source failure.
                    self.repository.failed(row['entity_ref'], row['generation'])
                completed += 1
                if progress:
                    progress(completed, max(total, completed))
        finally:
            self.lock.release()
        return completed

    def _run(self):
        while not self.stop.wait(1):
            if not self.coordinator.is_writer:
                continue
            try:
                self.drain()
            except Exception:  # noqa: BLE001 -- resilient daemon; durable work/status retained
                # No source text, file paths or provider errors in logs. Dirty work
                # stays durable and is retried; explicit jobs retain sanitized failure.
                self.stop.wait(10)
