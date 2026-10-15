# SPDX-License-Identifier: AGPL-3.0-or-later

import base64
import hashlib
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app import secrets
from app.config import get_settings
from scripts import setup_token
from scripts.setup_token import main as setup_token_main
from scripts.setup_token import store_env


def test_system_keychain_round_trip_and_plaintext_removal(monkeypatch, tmp_path: Path):
    class MacKeyring:
        __module__ = "keyring.backends.macOS"

    saved: dict[tuple[str, str], str] = {}
    monkeypatch.setattr(secrets.keyring, "get_keyring", MacKeyring)
    monkeypatch.setattr(secrets.keyring, "set_password", lambda service, user, token: saved.__setitem__((service, user), token))
    monkeypatch.setattr(secrets.keyring, "get_password", lambda service, user: saved.get((service, user)))
    url = "https://moodle.example.invalid"
    assert secrets.save_moodle_token(url, "fixture-token")
    assert secrets.load_moodle_token(url) == "fixture-token"
    env = tmp_path / ".env"
    store_env(env, url, "old-token")
    store_env(env, url, None)
    assert env.read_text(encoding="utf-8") == f"MOODLE_BASE_URL={url}\n"


def test_sso_setup_opens_mobile_launch_and_saves_validated_token(monkeypatch, capsys, tmp_path: Path):
    base_url = "https://moodle.example.invalid"
    passport = "invented-passport"
    token = "inventedtoken"
    site_id = hashlib.md5((base_url + passport).encode()).hexdigest()
    callback = "moodledl://token=" + base64.b64encode(f"{site_id}:::{token}".encode()).decode()
    launch_urls = []
    saved = []

    class FakeMoodle:
        def __init__(self, settings):
            assert settings.moodle_base_url == base_url
            assert settings.moodle_token == token

        def call(self, function):
            assert function == "core_webservice_get_site_info"
            return {"userid": 42}

    monkeypatch.setattr(setup_token.secrets, "token_urlsafe", lambda _size: passport)
    monkeypatch.setattr(setup_token.webbrowser, "open", lambda url: launch_urls.append(url))
    monkeypatch.setattr(setup_token.getpass, "getpass", lambda _prompt: callback)
    def _record_saved_token(url: str, value: str) -> bool:
        saved.append((url, value))
        return True

    monkeypatch.setattr(setup_token, "MoodleClient", FakeMoodle)
    monkeypatch.setattr(setup_token, "save_moodle_token", _record_saved_token)
    env = tmp_path / ".env"
    monkeypatch.setattr(sys, "argv", ["setup_token.py", "--moodle-url", base_url, "--env-file", str(env)])

    assert setup_token_main() == 0
    launch_url = (f"{base_url}/admin/tool/mobile/launch.php?service=moodle_mobile_app"
                  f"&passport={passport}&urlscheme=moodledl")
    assert launch_urls == [launch_url]
    assert saved == [(base_url, token)]
    assert env.read_text(encoding="utf-8") == f"MOODLE_BASE_URL={base_url}\n"
    output = capsys.readouterr()
    assert token not in output.out + output.err
    assert callback not in output.out + output.err


def test_sso_setup_rejects_callback_from_another_login_before_api(monkeypatch, capsys, tmp_path: Path):
    base_url = "https://moodle.example.invalid"
    payload = base64.b64encode(b"wrong-site-id:::inventedtoken").decode()
    callback = f"moodledl://token={payload}"
    monkeypatch.setattr(setup_token.secrets, "token_urlsafe", lambda _size: "invented-passport")
    monkeypatch.setattr(setup_token.webbrowser, "open", lambda _url: True)
    monkeypatch.setattr(setup_token.getpass, "getpass", lambda _prompt: callback)
    monkeypatch.setattr(setup_token, "MoodleClient", lambda _settings: pytest.fail("API darf nicht starten"))
    env = tmp_path / ".env"
    monkeypatch.setattr(sys, "argv", ["setup_token.py", "--moodle-url", base_url, "--env-file", str(env)])

    assert setup_token_main() == 2
    assert not env.exists()
    output = capsys.readouterr()
    assert callback not in output.out + output.err
    assert "inventedtoken" not in output.out + output.err


def test_unapproved_keyring_uses_local_env_fallback(monkeypatch, tmp_path: Path):
    class PlaintextKeyring:
        __module__ = "keyring.backends.file"

    monkeypatch.setattr(secrets.keyring, "get_keyring", PlaintextKeyring)
    assert not secrets.save_moodle_token("https://moodle.example.invalid", "fixture-token")
    assert secrets.load_moodle_token("https://moodle.example.invalid") == ""
    env = tmp_path / ".env"
    store_env(env, "https://moodle.example.invalid", "fixture-token")
    assert "MOODLE_TOKEN=fixture-token" in env.read_text(encoding="utf-8")
    if os.name == "nt":
        acl = subprocess.run(["icacls", str(env)], capture_output=True, text=True, check=True).stdout
        assert "(I)" not in acl
    else:
        assert env.stat().st_mode & 0o077 == 0


@pytest.mark.skipif(os.name != "nt", reason="Windows-Datei-ACL")
def test_windows_acl_helper_can_secure_a_new_file(tmp_path: Path):
    target = tmp_path / "acl-check.txt"
    target.write_text("", encoding="utf-8")
    script = Path(__file__).resolve().parents[1] / "scripts" / "windows_env_acl.ps1"
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
         "-File", str(script), "-Mode", "secure", "-Path", str(target)],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(os.name != "nt", reason="Windows-Datei-ACL")
def test_windows_env_rejects_and_repairs_explicit_other_user_access(monkeypatch, tmp_path: Path):
    monkeypatch.chdir(tmp_path)
    env = tmp_path / ".env"
    store_env(env, "https://moodle.example.invalid", "fixture-token")
    secrets.require_private_env(env)
    subprocess.run(["icacls", str(env), "/grant", "*S-1-1-0:R"],
                   capture_output=True, text=True, check=True)
    get_settings.cache_clear()
    try:
        with pytest.raises(PermissionError, match="Windows-.env-ACL"):
            get_settings()
        store_env(env, "https://moodle.example.invalid", "fixture-token")
        secrets.require_private_env(env)
        assert get_settings().moodle_token == "fixture-token"
    finally:
        get_settings.cache_clear()


@pytest.mark.skipif(os.name == "nt", reason="Unix-Dateimodus")
def test_settings_refuse_readable_or_symlinked_env_before_loading(monkeypatch, capsys, tmp_path: Path):
    monkeypatch.chdir(tmp_path)
    env = tmp_path / ".env"
    env.write_text("MOODLE_TOKEN=fixture-token\n", encoding="utf-8")
    env.chmod(0o644)
    get_settings.cache_clear()
    try:
        with pytest.raises(PermissionError, match="Rechte 600"):
            get_settings()
        monkeypatch.setattr(sys, "argv", ["setup_token.py", "--manual", "--env-file", str(env)])
        assert setup_token_main() == 2
        assert "fixture-token" not in capsys.readouterr().err
        env.chmod(0o600)
        assert get_settings().moodle_token == "fixture-token"
        get_settings.cache_clear()
        env.rename(tmp_path / "stored.env")
        env.symlink_to(tmp_path / "stored.env")
        with pytest.raises(PermissionError, match="Rechte 600"):
            get_settings()
    finally:
        get_settings.cache_clear()
