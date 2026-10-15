# SPDX-License-Identifier: AGPL-3.0-or-later
"""Measure a frozen loader or isolated client; never start a personal backend."""

import argparse
import json
import statistics
import subprocess
from pathlib import Path
from time import perf_counter


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    parser.add_argument('--client-check', action='store_true')
    parser.add_argument('--runs', type=int, default=3, choices=range(1, 11))
    args = parser.parse_args()
    rows = []
    for _ in range(args.runs):
        started = perf_counter()
        result = subprocess.run(
            [str(args.executable.resolve()), '--startup-check' if args.client_check else '--startup-probe-no-data'],
            capture_output=True, text=True, timeout=45, check=False,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
        elapsed = perf_counter() - started
        if result.returncode != (0 if args.client_check else 2):
            # Do not publish arbitrary process output; report only its exit status.
            raise SystemExit(f'Probe failed: exit {result.returncode}')
        row = {'seconds': round(elapsed, 4)}
        if args.client_check:
            details = json.loads(result.stdout)
            if details.get('ok') is not True:
                raise SystemExit('Client health or bundled UI failed')
            row['client_seconds'] = details['client_seconds']
        rows.append(row)
    print(json.dumps({'mode': 'client' if args.client_check else 'loader', 'runs': rows,
                      'median_seconds': round(statistics.median(row['seconds'] for row in rows), 4)}))


if __name__ == '__main__':
    main()
