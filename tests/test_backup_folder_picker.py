# SPDX-License-Identifier: AGPL-3.0-or-later

"""Choosing the backup folder with the system dialog instead of typing a path."""

import subprocess

from fastapi.testclient import TestClient

from app.backups import picker
from app.main import create_app


def fake_run(output: str, code: int = 0):
    def run(command, **kwargs):
        return subprocess.CompletedProcess(command, code, stdout=output, stderr="")
    return run


def test_the_chosen_folder_is_returned_and_cancelling_gives_none(monkeypatch):
    monkeypatch.setattr(picker.sys, "platform", "darwin")
    monkeypatch.setattr(picker.subprocess, "run", fake_run("/Users/ada/Backups/\n"))
    assert picker.choose_folder() == "/Users/ada/Backups"
    monkeypatch.setattr(picker.subprocess, "run", fake_run("", 1))
    assert picker.choose_folder() is None


def test_a_machine_without_a_dialog_reports_it(monkeypatch):
    monkeypatch.setattr(picker.sys, "platform", "linux")
    monkeypatch.setattr(picker.shutil, "which", lambda name: None)
    try:
        picker.choose_folder()
    except picker.PickerUnavailable:
        return
    raise AssertionError("expected PickerUnavailable")


def test_only_the_local_device_may_open_the_dialog(settings, coordinator, monkeypatch):
    monkeypatch.setattr(picker, "choose_folder", lambda: "/Users/ada/Backups")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app, client=("127.0.0.1", 50000)) as local:
        assert local.post("/api/backup/choose-folder").json() == {"folder": "/Users/ada/Backups"}
    with TestClient(app, client=("203.0.113.9", 50000)) as remote:
        assert remote.post("/api/backup/choose-folder").status_code == 409
