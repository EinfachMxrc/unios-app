# SPDX-License-Identifier: AGPL-3.0-or-later
"""Linux release packaging preserves binaries and excludes private source paths."""

import sys
import tarfile
from pathlib import Path

import pytest

from scripts import package_server


def configure(monkeypatch, root: Path, output: Path, names: list[str]):
    monkeypatch.setattr(package_server, 'ROOT', root)
    monkeypatch.setattr(sys, 'argv', ['package_server.py', str(output)])
    monkeypatch.setattr(package_server.subprocess, 'check_output',
                        lambda *args, **kwargs: '\0'.join(names).encode())


def test_linux_shell_endings_and_binary_preservation(tmp_path, monkeypatch):
    shell = tmp_path / 'deploy/server/provision.sh'
    shell.parent.mkdir(parents=True)
    shell.write_bytes(b'#!/bin/bash\r\nset -eu\r\n')
    binary = tmp_path / 'frontend/public/example.png'
    binary.parent.mkdir(parents=True)
    binary.write_bytes(b'\x89PNG\r\n\x1a\n')
    output = tmp_path / 'release.tar.gz'
    configure(monkeypatch, tmp_path, output,
              ['deploy/server/provision.sh', 'frontend/public/example.png'])
    package_server.main()
    with tarfile.open(output) as archive:
        assert archive.extractfile('deploy/server/provision.sh').read() == b'#!/bin/bash\nset -eu\n'
        assert archive.extractfile('frontend/public/example.png').read() == binary.read_bytes()
    assert shell.read_bytes().endswith(b'\r\n')  # Original working file is preserved.


def test_private_paths_excluded_even_if_listed(tmp_path, monkeypatch):
    for name in ['README.md', 'data/student.pdf', 'local/state.sqlite', '.env', '.tmp/helper.py']:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('synthetic fixture', encoding='utf-8')
    output = tmp_path / 'release.tar.gz'
    configure(monkeypatch, tmp_path, output,
              ['README.md', 'data/student.pdf', 'local/state.sqlite', '.env', '.tmp/helper.py'])
    package_server.main()
    with tarfile.open(output) as archive:
        assert archive.getnames() == ['README.md']


def test_existing_archive_is_never_overwritten(tmp_path, monkeypatch):
    output = tmp_path / 'release.tar.gz'
    output.write_bytes(b'previous release')
    configure(monkeypatch, tmp_path, output, [])
    with pytest.raises(FileExistsError):
        package_server.main()
    assert output.read_bytes() == b'previous release'
