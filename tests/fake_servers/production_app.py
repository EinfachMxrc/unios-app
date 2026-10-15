# SPDX-License-Identifier: AGPL-3.0-or-later

"""Isolated fake Moodle app with FastAPI serving the built React files."""

import os

os.environ["SERVE_REACT"] = "true"

from tests.fake_servers import phase1_app

app = phase1_app.app
