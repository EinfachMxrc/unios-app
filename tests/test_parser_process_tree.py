# SPDX-License-Identifier: AGPL-3.0-or-later
"""A frozen bootloader may spawn a child; cancellation must stop that child too."""
import ctypes
import os
import subprocess
import sys
import time

import pytest

from app.extract.isolated import stop_parser
from app.extract.process_limits import darwin_group_memory


def test_darwin_memory_counts_only_owned_process_group(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(subprocess, 'run', lambda *args, **kwargs:
                        SimpleNamespace(stdout='42 1024\n42 512\n84 999999\n'))
    assert darwin_group_memory(42) == 1536 * 1024


class FakeParser:
    pid = 12345

    def __init__(self):
        self.running = True
        self.kills = 0
        self.waits = []

    def poll(self):
        return None if self.running else 1

    def kill(self):
        self.kills += 1
        self.running = False

    def wait(self, *, timeout):
        self.waits.append(timeout)
        if self.running:
            raise subprocess.TimeoutExpired('invented-parser', timeout)
        return 1


def windows_cleanup_fixture(monkeypatch):
    from types import SimpleNamespace

    from app.extract import isolated

    monkeypatch.setattr(isolated, 'os', SimpleNamespace(name='nt', environ=os.environ))
    monkeypatch.setattr(subprocess, 'CREATE_NO_WINDOW', 0, raising=False)
    return isolated


def test_windows_tree_cleanup_retries_a_timeout_and_requires_confirmed_reap(monkeypatch):
    from types import SimpleNamespace

    windows_cleanup_fixture(monkeypatch)
    parser = FakeParser()
    calls = []

    def taskkill(command, **options):
        calls.append((command, options))
        if len(calls) == 1:
            raise subprocess.TimeoutExpired(command, options['timeout'])
        parser.running = False
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, 'run', taskkill)
    stop_parser(parser)
    assert len(calls) == 2
    assert all(command == ['taskkill.exe', '/PID', '12345', '/T', '/F']
               and options['timeout'] == 5 for command, options in calls)
    assert parser.kills == 0 and parser.waits == [5]


def test_windows_tree_cleanup_permanent_timeout_is_fail_closed_after_root_reap(monkeypatch):
    windows_cleanup_fixture(monkeypatch)
    parser = FakeParser()
    calls = []

    def taskkill(command, **options):
        calls.append(command)
        raise subprocess.TimeoutExpired(command, options['timeout'])

    monkeypatch.setattr(subprocess, 'run', taskkill)
    with pytest.raises(OSError, match='PARSER_TREE_KILL_UNCONFIRMED') as caught:
        stop_parser(parser)
    assert isinstance(caught.value.__cause__, subprocess.TimeoutExpired)
    assert len(calls) == 2 and parser.kills == 1 and parser.waits == [5]
    assert parser.poll() is not None


def test_windows_nonzero_tree_exit_does_not_claim_success_from_dead_parent(monkeypatch):
    from types import SimpleNamespace

    windows_cleanup_fixture(monkeypatch)
    parser = FakeParser()
    calls = []

    def taskkill(command, **options):
        calls.append(command)
        parser.running = False
        return SimpleNamespace(returncode=128)

    monkeypatch.setattr(subprocess, 'run', taskkill)
    with pytest.raises(OSError, match='PARSER_TREE_KILL_UNCONFIRMED'):
        stop_parser(parser)
    assert len(calls) == 2 and parser.kills == 0 and parser.waits == [5]


@pytest.mark.parametrize('permanent', [False, True])
def test_parser_deadline_survives_windows_tree_timeout(tmp_path, monkeypatch, permanent):
    from types import SimpleNamespace

    isolated = windows_cleanup_fixture(monkeypatch)
    parser = FakeParser()
    source = tmp_path / 'invented.txt'
    source.write_text('Erfundener Abbruchtest', encoding='utf-8')
    calls = []
    monkeypatch.setattr(isolated, 'start_process', lambda *args, **kwargs: parser)

    def taskkill(command, **options):
        calls.append(command)
        if permanent or len(calls) == 1:
            raise subprocess.TimeoutExpired(command, options['timeout'])
        parser.running = False
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, 'run', taskkill)
    if permanent:
        with pytest.raises(OSError, match='PARSER_CLEANUP_FAILED') as caught:
            isolated._run_parser(source, source.name, 'text/plain', timeout=0)
        assert isinstance(caught.value.__cause__, ValueError)
        assert str(caught.value.__cause__) == 'PARSER_TIMEOUT'
    else:
        with pytest.raises(ValueError, match='PARSER_TIMEOUT'):
            isolated._run_parser(source, source.name, 'text/plain', timeout=0)
    assert len(calls) == 2 and parser.poll() is not None


@pytest.mark.skipif(os.name != 'nt', reason='Windows frozen-process tree regression')
@pytest.mark.parametrize('first_tree_timeout', [False, True])
def test_cancellation_stops_the_owned_parser_descendant(tmp_path, monkeypatch, first_tree_timeout):
    from ctypes import wintypes

    pid_file = tmp_path / 'invented-child.pid'
    script = ('import subprocess,sys,time; from pathlib import Path; '
              'child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]); '
              'ready=Path(sys.argv[1]); staging=ready.with_suffix(".pending"); '
              'staging.write_text(str(child.pid));staging.replace(ready);time.sleep(60)')
    process = subprocess.Popen([sys.executable, '-c', script, str(pid_file)],
                               creationflags=subprocess.CREATE_NO_WINDOW)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = None
    if first_tree_timeout:
        taskkill = subprocess.run
        calls = []

        def transient_taskkill(command, **options):
            calls.append(command)
            if len(calls) == 1:
                raise subprocess.TimeoutExpired(command, options['timeout'])
            return taskkill(command, **options)

        monkeypatch.setattr(subprocess, 'run', transient_taskkill)
    try:
        deadline = time.monotonic() + 5
        while not pid_file.is_file() and time.monotonic() < deadline:
            time.sleep(.02)
        assert pid_file.is_file()
        handle = kernel.OpenProcess(0x100001, False, int(pid_file.read_text()))
        assert handle
        stop_parser(process)
        process.wait(timeout=5)
        assert kernel.WaitForSingleObject(handle, 5000) == 0
        if first_tree_timeout:
            assert len(calls) == 2
    finally:
        stop_parser(process)
        process.wait(timeout=5)
        if handle:
            if kernel.WaitForSingleObject(handle, 0) != 0:
                kernel.TerminateProcess(handle, 1)
            kernel.CloseHandle(handle)


@pytest.mark.skipif(os.name != 'nt', reason='Windows owned-job regression')
def test_managed_worker_stops_descendants_after_a_normal_parent_exit(tmp_path):
    import win32api
    import win32con
    import win32event

    from app.extract.isolated import start_process

    pid_file = tmp_path / 'fictional-managed-child.pid'
    script = ('import subprocess,sys; from pathlib import Path; '
              'child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]); '
              'Path(sys.argv[1]).write_text(str(child.pid))')
    process = start_process([sys.executable, '-c', script, str(pid_file)], dict(os.environ))
    handle = None
    try:
        assert process.wait(timeout=10) == 0
        handle = win32api.OpenProcess(win32con.SYNCHRONIZE, False, int(pid_file.read_text()))
        assert win32event.WaitForSingleObject(handle, 0) == win32event.WAIT_TIMEOUT
        stop_parser(process)
        assert win32event.WaitForSingleObject(handle, 5000) == win32event.WAIT_OBJECT_0
    finally:
        stop_parser(process)
        if handle is not None:
            handle.Close()
