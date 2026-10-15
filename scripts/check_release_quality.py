# SPDX-License-Identifier: AGPL-3.0-or-later
"""Require the complete quality matrix at the exact installer source revision."""
import json
import os
import re
from urllib.request import Request, urlopen

REQUIRED = {'Backend (ubuntu-latest)', 'Backend (macos-latest)', 'Backend (windows-latest)',
            'Linux Docker Compose', 'React und Browser', 'Linux GLib-Sicherheitsbackport'}


def candidate_runs(payload, sha):
    return [run for run in payload['workflow_runs'] if run['head_sha'] == sha
            and run['event'] == 'workflow_dispatch' and run['status'] == 'completed'
            and run['conclusion'] == 'success']


def validate_jobs(jobs):
    completed = {job['name'] for job in jobs if job['status'] == 'completed' and job['conclusion'] == 'success'}
    missing = REQUIRED - completed
    if missing:
        raise ValueError('Missing successful matrix jobs: ' + ', '.join(sorted(missing)))


def main():
    repository, sha = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository) or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid GitHub repository or source revision')

    def get(path):
        request = Request('https://api.github.com/repos/' + repository + path,
                          headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                                   'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    runs = candidate_runs(get('/actions/workflows/quality.yml/runs?event=workflow_dispatch&per_page=100'), sha)
    for run in runs:
        jobs = get(f"/actions/runs/{run['id']}/jobs?filter=latest&per_page=100")
        if jobs['total_count'] > 100:
            raise ValueError('Unexpected matrix size; require a new gate review')
        validate_jobs(jobs['jobs'])
        print('Complete quality matrix verified at ' + sha)
        return
    raise ValueError('No successful complete quality run at this exact revision. Run Qualität manually first.')


if __name__ == '__main__':
    main()
