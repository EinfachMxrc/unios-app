# SPDX-License-Identifier: AGPL-3.0-or-later

"""Track HTTP writers so a planned handoff can wait for them to finish."""

from __future__ import annotations

import threading


class WriteGateBusy(RuntimeError):
    """Another handoff is already draining writes."""


class WriteGate:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._in_flight = 0
        self._draining = False

    def enter(self) -> bool:
        with self._condition:
            if self._draining:
                return False
            self._in_flight += 1
            return True

    def leave(self) -> None:
        with self._condition:
            if self._in_flight < 1:
                raise RuntimeError("Schreibsperre ohne laufende Anfrage freigegeben")
            self._in_flight -= 1
            if self._in_flight == 0:
                self._condition.notify_all()

    def drain(self, *, timeout_seconds: float) -> bool:
        """Reject new writers and wait until all accepted requests have returned."""
        with self._condition:
            if self._draining:
                raise WriteGateBusy("Host-Übergabe läuft bereits")
            self._draining = True
            return self._condition.wait_for(lambda: self._in_flight == 0, timeout=timeout_seconds)

    def reopen(self) -> None:
        with self._condition:
            self._draining = False
            self._condition.notify_all()

    @property
    def draining(self) -> bool:
        with self._condition:
            return self._draining
