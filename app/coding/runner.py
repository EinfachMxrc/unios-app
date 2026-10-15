# SPDX-License-Identifier: AGPL-3.0-or-later
"""Judge0 adapter: fixed endpoint, no callbacks, no user compiler flags or network.

Judge0 must be deployed on a separately isolated machine. A Python subprocess
on the UniOS host is deliberately not an execution backend.
"""

import base64
import io
import json
import math
import re
import time
import zipfile
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.coding.contracts import Language

HARNESSES = {
    'python': 'import json, sys\nfrom Solution import solve\nvalues = list(map(int, sys.stdin.read().split()))\nprint(json.dumps(solve(values)))\n',
    'javascript': "const fs = require('fs');\nconst { solve } = require('./Solution');\nconst raw = fs.readFileSync(0, 'utf8').trim();\nconst values = raw ? raw.split(/\\s+/).map(Number) : [];\nconsole.log(JSON.stringify(solve(values)));\n",
    'java': 'import java.util.*;\npublic class Main {\n public static void main(String[] args) {\n  Scanner scanner = new Scanner(System.in);\n  ArrayList<Integer> items = new ArrayList<>();\n  while (scanner.hasNextInt()) items.add(scanner.nextInt());\n  int[] values = items.stream().mapToInt(Integer::intValue).toArray();\n  System.out.println(Arrays.toString(Solution.solve(values)));\n }\n}\n',
}
SUFFIXES = {'python': 'py', 'java': 'java', 'javascript': 'js'}


class RunnerUnavailable(Exception):
    """Sanitized execution service failure, never its URL/token/raw response."""


@dataclass(frozen=True)
class Execution:
    status: int
    stdout: str
    stderr: str
    compile_output: str
    runtime_ms: float | None
    memory_kib: int | None


class ExecutionBackend(Protocol):
    def ready(self) -> dict: ...
    def execute(self, language: Language, files: dict[str, str], values: list[int], check) -> Execution: ...


class Judge0Backend:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.transport = transport
        self.language_ids: dict[str, int] = {}

    def _client(self):
        if not self.settings.coding_runner_url or not self.settings.coding_runner_isolated or not self.settings.coding_runner_token:
            raise RunnerUnavailable('RUNNER_NOT_CONFIGURED')
        return httpx.Client(base_url=self.settings.coding_runner_url, timeout=10,
                            follow_redirects=False, trust_env=False, transport=self.transport,
                            headers={'X-Auth-Token': self.settings.coding_runner_token})

    def _json(self, client, method, path, **kwargs):
        try:
            with client.stream(method, path, **kwargs) as response:
                response.raise_for_status()
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 2 * 1024 * 1024:
                        raise RunnerUnavailable('RUNNER_RESPONSE_LIMIT')
                return json.loads(body)
        except (httpx.HTTPError, ValueError, UnicodeError):
            raise RunnerUnavailable('RUNNER_UNAVAILABLE') from None

    def ready(self):
        with self._client() as client:
            config = self._json(client, 'GET', '/config_info')
            if not isinstance(config, dict) or config.get('enable_network') is not False or config.get('allow_enable_network') is not False:
                raise RunnerUnavailable('RUNNER_NETWORK_POLICY')
            languages = self._json(client, 'GET', '/languages')
            if not isinstance(languages, list):
                raise RunnerUnavailable('RUNNER_PROTOCOL')
            mapping = {}
            for language, prefix in [('python', 'Python ('), ('java', 'Java ('), ('javascript', 'JavaScript (Node.js')]:
                available = [row for row in languages if isinstance(row, dict) and str(row.get('name', '')).startswith(prefix) and isinstance(row.get('id'), int)]
                if available:
                    mapping[language] = available[-1]['id']
            if len(mapping) != 3:
                raise RunnerUnavailable('RUNNER_LANGUAGES_MISSING')
            self.language_ids = mapping
            return {'ready': True, 'languages': list(mapping), 'backend': 'judge0', 'network': False,
                    'cpu_seconds': 2, 'wall_seconds': 6, 'memory_kib': 262144}

    def execute(self, language: Language, files: dict[str, str], values: list[int], check) -> Execution:
        check()
        if not self.language_ids:
            self.ready()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            for name, body in sorted(files.items()):
                zip_file.writestr(name, body)
        payload = {
            'language_id': self.language_ids[language],
            'source_code': base64.b64encode(HARNESSES[language].encode()).decode(),
            'additional_files': base64.b64encode(archive.getvalue()).decode(),
            'stdin': base64.b64encode(' '.join(map(str, values)).encode()).decode(),
            'enable_network': False, 'cpu_time_limit': 2, 'wall_time_limit': 6,
            'memory_limit': 262144, 'stack_limit': 64000, 'max_file_size': 256,
            'max_processes_and_or_threads': 64, 'number_of_runs': 1,
            'enable_per_process_and_thread_time_limit': False,
            'enable_per_process_and_thread_memory_limit': False,
        }
        with self._client() as client:
            created = self._json(client, 'POST', '/submissions', params={'base64_encoded': 'true', 'wait': 'false'}, json=payload)
            token = created.get('token') if isinstance(created, dict) else None
            if not isinstance(token, str) or not re.fullmatch(r'[a-zA-Z0-9-]{8,80}', token):
                raise RunnerUnavailable('RUNNER_PROTOCOL')
            deadline = time.monotonic() + 45
            while True:
                check()
                result = self._json(client, 'GET', '/submissions/' + token,
                                    params={'base64_encoded': 'true', 'fields': 'status,stdout,stderr,compile_output,time,memory'})
                if not isinstance(result, dict) or not isinstance(result.get('status'), dict):
                    raise RunnerUnavailable('RUNNER_PROTOCOL')
                status = result['status'].get('id')
                if isinstance(status, int) and 3 <= status <= 14:
                    break
                if status not in {1, 2} or time.monotonic() >= deadline:
                    raise RunnerUnavailable('RUNNER_TIMEOUT')
                time.sleep(.15)
        def output(field):
            encoded = result.get(field) or ''
            try:
                # Judge0's Ruby encoder wraps Base64 at line boundaries. Validate
                # the alphabet after removing only transport whitespace.
                if not isinstance(encoded, str):
                    raise RunnerUnavailable('RUNNER_PROTOCOL')
                encoded = re.sub(r'[\r\n\t ]', '', encoded)
                body = base64.b64decode(encoded, validate=True)
                if len(body) > 256 * 1024:
                    raise RunnerUnavailable('RUNNER_OUTPUT_LIMIT')
                return body.decode('utf-8', errors='replace')
            except (ValueError, TypeError):
                raise RunnerUnavailable('RUNNER_PROTOCOL') from None
        try:
            runtime = float(result['time']) * 1000 if result.get('time') is not None else None
            memory = int(result['memory']) if result.get('memory') is not None else None
        except (TypeError, ValueError, OverflowError):
            raise RunnerUnavailable('RUNNER_PROTOCOL') from None
        if runtime is not None and (not math.isfinite(runtime) or runtime < 0) or memory is not None and memory < 0:
            raise RunnerUnavailable('RUNNER_PROTOCOL')
        check()
        return Execution(status, output('stdout'), output('stderr'), output('compile_output'), runtime, memory)
