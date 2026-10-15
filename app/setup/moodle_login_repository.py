# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local, short-lived SSO proofs; never store a passport or Moodle token."""

import os
import secrets
from pathlib import Path

from pydantic import BaseModel, Field


class LoginProof(BaseModel):
    site_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    created_at: float = Field(allow_inf_nan=False)
    base_url: str
    institution: str


class CompletedLogin(LoginProof):
    token_hash: str = Field(pattern=r"^[a-f0-9]{64}$")


class LoginState(BaseModel):
    pending: list[LoginProof] = Field(default_factory=list, max_length=5)
    completed: CompletedLogin | None = None


class MoodleLoginRepository:
    def __init__(self, local_dir: Path):
        self.path = local_dir / "moodle-login-attempts.json"

    def load(self) -> LoginState:
        if self.path.is_symlink():
            raise OSError("Anmeldezustand darf kein symbolischer Link sein")
        try:
            with self.path.open(encoding="utf-8") as stream:
                content = stream.read(8193)
        except FileNotFoundError:
            return LoginState()
        if len(content) > 8192:
            raise OSError("Anmeldezustand ist zu groß")
        try:
            return LoginState.model_validate_json(content)
        except ValueError as exc:
            raise OSError("Anmeldezustand ist unlesbar") from exc

    def save(self, state: LoginState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(self.path.name + "." + secrets.token_hex(8) + ".tmp")
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                stream.write(state.model_dump_json())
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)
