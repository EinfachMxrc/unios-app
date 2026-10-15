# SPDX-License-Identifier: AGPL-3.0-or-later

"""Separate fake Moodle host so a browser test can release it safely."""

from tests.fake_servers import phase1_app

app = phase1_app.app
