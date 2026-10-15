# SPDX-License-Identifier: AGPL-3.0-or-later
"""Publication checks reject forbidden objects before requesting their contents."""
import subprocess

from scripts import audit_history


def test_history_scanner_never_fetches_private_or_oversized_contents(tmp_path, monkeypatch):
    def git(*arguments):
        return subprocess.run(['git', '-C', str(tmp_path), *arguments], check=True,
                              capture_output=True).stdout.decode().strip()

    git('init')
    git('config', 'user.name', 'Synthetic Test')
    git('config', 'user.email', 'test@example.invalid')
    (tmp_path / 'data').mkdir()
    (tmp_path / 'data' / 'fake.txt').write_text('Synthetic protected data', encoding='utf-8')
    (tmp_path / 'oversized.txt').write_text('x' * 2000, encoding='utf-8')
    (tmp_path / 'source.py').write_text('print("synthetic source")\n', encoding='utf-8')
    git('add', 'data/fake.txt', 'oversized.txt', 'source.py')
    git('commit', '-m', 'Synthetic fixture')
    permitted = git('rev-parse', 'HEAD:source.py')
    monkeypatch.setattr(audit_history, 'MAX_BLOB_BYTES', 1000)
    original = subprocess.Popen
    requested = []

    def process(arguments, *args, **kwargs):
        value = original(arguments, *args, **kwargs)
        if arguments[-1] == '--batch':
            underlying = value.stdin

            class Input:
                def write(self, payload):
                    requested.append(payload.decode().strip())
                    return underlying.write(payload)

                def flush(self):
                    return underlying.flush()

                def close(self):
                    return underlying.close()

            value.stdin = Input()
        return value

    monkeypatch.setattr(subprocess, 'Popen', process)
    blobs, _, findings = audit_history.audit(tmp_path / '.git')
    assert blobs == 3
    assert requested == [permitted]
    assert {item[0] for item in findings} == {'private_path_unread', 'large_blob_unscanned'}
