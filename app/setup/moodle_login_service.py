# SPDX-License-Identifier: AGPL-3.0-or-later

"""Match a Moodle return to a bounded, local sign-in attempt across restarts."""

import hashlib
import secrets
import time
from collections.abc import Callable
from threading import Lock

from app.setup.moodle_callback import decode_callback
from app.setup.moodle_login_repository import (
    CompletedLogin,
    LoginProof,
    LoginState,
    MoodleLoginRepository,
)

LOGIN_LIFETIME = 900


class MoodleLoginExpired(ValueError):
    pass


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class MoodleLoginService:
    def __init__(self, repository: MoodleLoginRepository):
        self.repository = repository
        self.lock = Lock()

    @staticmethod
    def _active(proof: LoginProof, base_url: str, institution: str) -> bool:
        return (proof.base_url == base_url and proof.institution == institution
                and 0 <= time.time() - proof.created_at <= LOGIN_LIFETIME)

    def start(self, base_url: str, institution: str, passport: str) -> None:
        site_id = hashlib.md5((base_url + passport).encode()).hexdigest()
        with self.lock:
            state = self.repository.load()
            active = [proof for proof in state.pending if self._active(proof, base_url, institution)]
            proof = LoginProof(site_hash=_hash(site_id), created_at=time.time(),
                               base_url=base_url, institution=institution)
            # Another window may still be completing its MFA. A new launch
            # keeps up to four earlier attempts until one succeeds.
            self.repository.save(LoginState(pending=active[-4:] + [proof]))

    def finish(self, callback: str, base_url: str, institution: str, current_token: Callable[[], str],
               connect: Callable[[str], dict], status: Callable[[], dict]) -> dict:
        with self.lock:
            state = self.repository.load()
            completed = state.completed
            token_in_use = current_token()
            if completed and self._active(completed, base_url, institution) and token_in_use:
                site_id, token = decode_callback(callback)
                if (secrets.compare_digest(completed.site_hash, _hash(site_id))
                        and secrets.compare_digest(completed.token_hash, _hash(token))
                        and secrets.compare_digest(completed.token_hash, _hash(token_in_use))):
                    return status()
            active = [proof for proof in state.pending if self._active(proof, base_url, institution)]
            if not active:
                raise MoodleLoginExpired("Moodle-Anmeldung erneut starten")
            site_id, token = decode_callback(callback)
            matched = next((proof for proof in active if secrets.compare_digest(proof.site_hash, _hash(site_id))), None)
            if matched is None:
                raise ValueError("Die Weiterleitung gehört nicht zu diesem Anmeldevorgang")
            result = connect(token)
            completed = CompletedLogin(**matched.model_dump(), token_hash=_hash(token))
            self.repository.save(LoginState(completed=completed))
            return result
