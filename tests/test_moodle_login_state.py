# SPDX-License-Identifier: AGPL-3.0-or-later

import base64
import hashlib
import os
from urllib.parse import quote

import pytest

from app.setup.moodle_login_repository import MoodleLoginRepository
from app.setup.moodle_login_service import (
    LOGIN_LIFETIME,
    MoodleLoginExpired,
    MoodleLoginService,
)

BASE = "https://moodle.example.invalid"


def callback(passport: str) -> str:
    site = hashlib.md5((BASE + passport).encode()).hexdigest()
    return "marcunios://token=" + base64.b64encode(f"{site}:::inventedtoken".encode()).decode()


def test_restart_retains_proofs_and_success_without_storing_credentials(tmp_path):
    repository = MoodleLoginRepository(tmp_path)
    service = MoodleLoginService(repository)
    service.start(BASE, "example", "invented-passport")
    content = repository.path.read_text()
    assert "invented-passport" not in content
    assert "inventedtoken" not in content
    assert callback("invented-passport") not in content
    if os.name != "nt":
        assert repository.path.stat().st_mode & 0o777 == 0o600
    current = [""]
    calls = []

    def connect(token):
        calls.append(token)
        current[0] = token
        return {"moodle_connected": True}

    def finish(instance, value):
        return instance.finish(value, BASE, "example", lambda: current[0], connect,
                               lambda: {"moodle_connected": bool(current[0])})

    restarted = MoodleLoginService(MoodleLoginRepository(tmp_path))
    assert finish(restarted, callback("invented-passport"))["moodle_connected"]
    again = MoodleLoginService(MoodleLoginRepository(tmp_path))
    assert finish(again, callback("invented-passport"))["moodle_connected"]
    normalized = callback("invented-passport")
    encoded = "marcunios://token=" + quote(normalized.split("token=", 1)[1], safe="")
    assert finish(again, encoded)["moodle_connected"]
    assert calls == ["inventedtoken"]
    content = repository.path.read_text()
    assert "inventedtoken" not in content
    assert "invented-passport" not in content
    # A replaced or revoked token must not reuse a cached success.
    current[0] = "differentinventedtoken"
    with pytest.raises(MoodleLoginExpired):
        finish(again, callback("invented-passport"))


def test_another_launch_keeps_inflight_mfa_but_only_one_can_complete(tmp_path):
    service = MoodleLoginService(MoodleLoginRepository(tmp_path))
    service.start(BASE, "example", "first-passport")
    service.start(BASE, "example", "second-passport")
    assert len(service.repository.load().pending) == 2
    with pytest.raises(ValueError):
        service.finish(callback("unrelated"), BASE, "example", lambda: "", lambda _token: {}, dict)
    service.finish(callback("first-passport"), BASE, "example", lambda: "", lambda _token: {}, dict)
    with pytest.raises(MoodleLoginExpired):
        service.finish(callback("second-passport"), BASE, "example", lambda: "", lambda _token: {}, dict)


def test_proofs_expire_and_are_bounded_and_institution_specific(tmp_path, monkeypatch):
    clock = [1_800_000_000.0]
    monkeypatch.setattr("app.setup.moodle_login_service.time.time", lambda: clock[0])
    service = MoodleLoginService(MoodleLoginRepository(tmp_path))
    for index in range(7):
        service.start(BASE, "example", f"passport-{index}")
    assert len(service.repository.load().pending) == 5
    with pytest.raises(ValueError):
        service.finish(callback("passport-0"), BASE, "example", lambda: "", lambda _token: {}, dict)
    with pytest.raises(MoodleLoginExpired):
        service.finish(callback("passport-6"), BASE, "other", lambda: "", lambda _token: {}, dict)
    clock[0] += LOGIN_LIFETIME + 1
    with pytest.raises(MoodleLoginExpired):
        service.finish(callback("passport-6"), BASE, "example", lambda: "", lambda _token: {}, dict)


def test_corrupted_or_linked_state_fails_closed(tmp_path):
    repository = MoodleLoginRepository(tmp_path)
    repository.path.write_text("broken")
    with pytest.raises(OSError, match="unlesbar"):
        repository.load()
    target = tmp_path / "other.json"
    repository.path.rename(target)
    try:
        repository.path.symlink_to(target)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 1314:
            pytest.skip("Windows symlink creation requires Developer Mode or administrator rights")
        raise
    with pytest.raises(OSError, match="symbolischer Link"):
        repository.load()
