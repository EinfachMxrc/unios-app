# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only second device sharing fake Moodle data with a writing host."""

import sqlite3
from importlib import import_module

owner = import_module("tests.fake_servers.phase1_app")

from app.host.lease import HostCoordinator
from app.main import create_app

settings = owner.settings
standby_local = owner._data_dir / "standby-local"
standby_local.mkdir()
standby_database = standby_local / "test.sqlite3"
with sqlite3.connect(settings.database_url.removeprefix("sqlite:///")) as source, sqlite3.connect(standby_database) as target:
    source.backup(target)

standby_settings = settings.model_copy(update={
    "local_dir": standby_local,
    "database_url": f"sqlite:///{standby_database}",
    "server_mode": False,
    "ntfy_url": "",
    "discord_webhook_url": "",
    "public_periods_enabled": False,
    "api_auth_required": False,
})
standby = HostCoordinator(standby_settings)
app = create_app(standby_settings, connectors=[], start_scheduler=False, coordinator=standby)
