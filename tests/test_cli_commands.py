# SPDX-License-Identifier: AGPL-3.0-or-later

import json

from typer.testing import CliRunner

from app.cli.main import cli
from app.health import doctor
from app.host.syncthing import FolderSyncStatus
from tests.test_host_handoff import device, fake_syncthing_config, sync_folder
from tests.test_moodle_sync import FixtureMoodle


def test_read_commands_work_while_another_process_owns_host(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    runner = CliRunner()
    for command, expected in ((["status"], "last_sync"), (["courses"], None),
                              (["changes"], None), (["doctor"], "checks"), (["host", "status"], "device_name")):
        result = runner.invoke(cli, command)
        assert result.exit_code == 0, result.output
        value = json.loads(result.stdout)
        if expected is not None:
            assert expected in value
        else:
            assert value == []
    invalid = runner.invoke(cli, ["changes", "--since", "2026-09-24"])
    assert invalid.exit_code == 2


def test_write_commands_refuse_a_second_process(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    runner = CliRunner()
    for command in (["sync"], ["rebuild-index"], ["rebuild-annotations"],
                    ["backup"], ["host", "snapshot"], ["host", "release"]):
        result = runner.invoke(cli, command)
        assert result.exit_code == 3, result.output
        expected = "gestoppt" if command[-1] == "release" else "bereits aktive Host-Instanz"
        assert expected in result.output


def test_cli_sync_and_read_commands_use_real_database_without_redownloading(
    monkeypatch, settings, factory, coordinator,
):
    moodle = FixtureMoodle(settings)
    coordinator.close()
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.cli.main.MoodleClient", lambda _settings: moodle.connector)
    runner = CliRunner()

    first = runner.invoke(cli, ["sync"])
    assert first.exit_code == 0, first.output
    assert json.loads(first.stdout)["course_count"] == 2
    assert moodle.download_count == 2
    second = runner.invoke(cli, ["sync"])
    assert second.exit_code == 0, second.output
    assert moodle.download_count == 2

    status = runner.invoke(cli, ["status"])
    assert status.exit_code == 0, status.output
    assert json.loads(status.stdout)["last_sync"]["status"] == "success", status.stdout
    courses = runner.invoke(cli, ["courses"])
    assert courses.exit_code == 0, courses.output
    assert {item["name"] for item in json.loads(courses.stdout)} == {"Mathematik", "Programmieren 1"}
    changes = runner.invoke(cli, ["changes", "--since", "2020-01-01T00:00:00+00:00"])
    assert changes.exit_code == 0, changes.output
    assert any(item["kind"] == "new" for item in json.loads(changes.stdout))
    future = runner.invoke(cli, ["changes", "--since", "2099-01-01T00:00:00+00:00"])
    assert future.exit_code == 0, future.output
    assert json.loads(future.stdout) == []
    doctor = runner.invoke(cli, ["doctor"])
    assert doctor.exit_code == 0, doctor.output
    assert json.loads(doctor.stdout)["checks"]["database_reachable"] is True


def test_cli_planned_release_and_acquire_on_another_device(monkeypatch, tmp_path, settings, factory, coordinator):
    configured = settings.model_copy(update={"tailscale_ip": "100.101.102.103",
                                             "syncthing_folder_id": "uni-data",
                                             "syncthing_api_key": "fixture-syncthing-key"})  # pragma: allowlist secret
    fake_syncthing_config(monkeypatch, configured)
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(True, "Fertig"))
    monkeypatch.setattr("app.cli.main.get_settings", lambda: configured)
    coordinator.close()
    runner = CliRunner()
    released = runner.invoke(cli, ["host", "release"])
    assert released.exit_code == 0, released.output
    assert json.loads(released.stdout)["generation"] == 2
    assert json.loads(runner.invoke(cli, ["host", "status"]).stdout)["mode"] == "released"

    pc = device(tmp_path, "Test-PC")
    sync_folder(configured, pc)
    fake_syncthing_config(monkeypatch, pc)
    monkeypatch.setattr("app.cli.main.get_settings", lambda: pc)
    claimed = runner.invoke(cli, ["host", "acquire"])
    assert claimed.exit_code == 0, claimed.output
    assert json.loads(claimed.stdout)["generation"] == 2
    assert json.loads(runner.invoke(cli, ["host", "status"]).stdout)["mode"] == "claimed"
