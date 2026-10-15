# SPDX-License-Identifier: AGPL-3.0-or-later
import pytest

from scripts.check_release_quality import REQUIRED, candidate_runs, validate_jobs


def test_only_full_success_at_exact_revision_qualifies():
    def run(sha='a', event='workflow_dispatch', status='completed', conclusion='success'):
        return {'head_sha': sha, 'event': event, 'status': status, 'conclusion': conclusion}

    good = run()
    assert candidate_runs({'workflow_runs': [run('b'), run(event='push'), run(status='in_progress'),
                                            run(conclusion='failure'), good]}, 'a') == [good]


def test_skipped_missing_or_failed_platform_never_qualifies():
    jobs = [{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in REQUIRED]
    validate_jobs(jobs)
    with pytest.raises(ValueError):
        validate_jobs(jobs[:-1])
    jobs[0]['conclusion'] = 'skipped'
    with pytest.raises(ValueError):
        validate_jobs(jobs)
