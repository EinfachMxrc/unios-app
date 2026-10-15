# SPDX-License-Identifier: AGPL-3.0-or-later
"""Operator smoke test: synthetic programs only, token on stdin, never logs secrets.

Call with a private SSH tunnel as argv[1]. Uses the actual production adapter.
It does not open UniOS settings, credentials or student data.
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.coding import templates
from app.coding.runner import Judge0Backend


def main():
    runner = Judge0Backend(SimpleNamespace(coding_runner_url=sys.argv[1], coding_runner_isolated=True,
                                          coding_runner_token=sys.stdin.read().strip()))
    assert runner.ready()['network'] is False
    passed = 0
    for language, suffix in [('python', 'py'), ('javascript', 'js'), ('java', 'java')]:
        for template in templates.ENTRIES:
            inputs = [[0], [12]] if template == 'factorial' else [[-3, 0, 2, 2], []]
            for values in inputs:
                result = runner.execute(language, {f'Solution.{suffix}': templates.solution(language, template)}, values, lambda: None)
                assert result.status == 3, (language, template, result.status, result.stderr, result.compile_output)
                assert json.loads(result.stdout) == templates.oracle(template, values), (language, template)
                passed += 1
            print(json.dumps({'language': language, 'template': template, 'passed': len(inputs)}), flush=True)
    programs = [
        ('python', {'Solution.py': 'def solve(values):\n    while True: pass\n'}, {5}),
        ('python', {'Solution.py': 'def solve(values):\n    import socket\n    socket.create_connection(("1.1.1.1",443),timeout=1)\n    return []\n'}, {11, 12}),
        ('python', {'Solution.py': 'def solve(values):\n    raise ValueError("synthetic")\n'}, {11, 12}),
        # Allocating/touching this much memory can reach the CPU bound first on a
        # busy two-core guest. Either resource limit must reject the program.
        ('python', {'Solution.py': 'def solve(values):\n    return [len(bytearray(400*1024*1024))]\n'}, {5, 11, 12}),
        ('python', {'Solution.py': 'def solve(values):\n    import os\n    return [int(os.path.exists("/var/lib/unios"))]\n'}, {3}),
        ('java', {'Solution.java': 'public class Solution { broken }'}, {6}),
        ('javascript', {'Solution.js': "const {reverse} = require('./Helper'); module.exports={solve:reverse};", 'Helper.js': 'module.exports.reverse = values => [...values].reverse();'}, {3}),
    ]
    for case, (language, files, expected_status) in enumerate(programs):
        result = runner.execute(language, files, [1, 2], lambda: None)
        assert result.status in expected_status, (case, language, result.status)
        if 'bytearray' in ''.join(files.values()):
            assert result.memory_kib is not None and result.memory_kib <= 262144
        if 'os.path.exists' in ''.join(files.values()):
            assert json.loads(result.stdout) == [0]
        print(json.dumps({'case': case, 'status': result.status, 'memory_kib': result.memory_kib}), flush=True)
        passed += 1
    print(json.dumps({'passed': passed, 'real_runner': True, 'network_blocked': True, 'timeout_checked': True}))


if __name__ == '__main__':
    main()
