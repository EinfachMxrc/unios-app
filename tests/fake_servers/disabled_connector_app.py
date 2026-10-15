# SPDX-License-Identifier: AGPL-3.0-or-later

"""Production React app with Moodle deliberately disabled and fake local data."""

from importlib import import_module

# Bootstrap the factory-only, isolated fake settings before using app.main.
owner = import_module("tests.fake_servers.phase1_app")

from app.main import create_app

settings = owner.settings.model_copy(update={"moodle_enabled": False, "serve_react": True})
app = create_app(settings, start_scheduler=False, coordinator=owner.host)
