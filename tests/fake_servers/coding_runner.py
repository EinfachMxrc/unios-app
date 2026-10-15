# SPDX-License-Identifier: AGPL-3.0-or-later
"""Browser fixtures only: no eval/exec of submitted code, no network."""
import json
import time

from app.coding.runner import Execution


class BrowserCodingRunner:
    def ready(self):
        return {'ready': True, 'languages': ['python', 'java', 'javascript'], 'network': False}

    def execute(self, language, files, values, check):
        check()
        time.sleep(.12)
        check()
        known_fixture = 'return values[::-1]' in files.get('Solution.py', '')
        return Execution(3, json.dumps(values[::-1] if known_fixture else []), '', '', 8.5, 1000)
