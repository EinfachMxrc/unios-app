# SPDX-License-Identifier: AGPL-3.0-or-later
"""One resource-bounded child per parse, outside database transactions."""
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic

from app.extract.process_limits import MEMORY_BYTES, darwin_group_memory
from app.extract.service import TEXT_SUFFIXES, ExtractedPage


class ParserCancelled(Exception):
    pass


def stop_parser(process):
    """Also stop a frozen bootloader's child; never leave a parser after timeout."""
    stop_tree = getattr(process, 'stop_tree', None)
    if stop_tree is not None:
        stop_tree()
        return
    if process.poll() is not None:
        return
    if os.name == 'nt':
        failure = None
        for _attempt in range(2):
            try:
                result = subprocess.run(['taskkill.exe', '/PID', str(process.pid), '/T', '/F'],
                                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL, timeout=5, check=False,
                                        creationflags=subprocess.CREATE_NO_WINDOW)
                if result.returncode != 0:
                    failure = OSError('PARSER_TREE_KILL_UNCONFIRMED')
                    continue
                process.wait(timeout=5)
                return
            except (OSError, subprocess.TimeoutExpired) as exc:
                failure = exc
        # A dead parent alone cannot prove that its frozen sidecar also exited.
        # Reap our direct child, but keep an unconfirmed tree kill fail-closed.
        try:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise OSError('PARSER_CLEANUP_FAILED') from exc
        raise OSError('PARSER_TREE_KILL_UNCONFIRMED') from failure
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()


def start_process(command, env):
    if os.name == 'nt':
        from app.extract.windows_process import WindowsWorker

        return WindowsWorker(command, env)
    return subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env=env, start_new_session=True)


def _run_parser(source: Path, filename: str, mime: str, *, mode='background', cancel=lambda: False,
                check=lambda: None, progress=lambda done, total: None, timeout=45):
    if source.stat().st_size > 512 * 1024 * 1024:
        raise ValueError('PARSER_INPUT_LIMIT')
    with TemporaryDirectory(prefix='unios-parser-') as folder:
        output, status = Path(folder) / 'pages.jsonl', Path(folder) / 'progress'
        env = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP') if key in os.environ}
        env['PYTHONIOENCODING'] = 'utf-8'
        command = [sys.executable, '-I', str(Path(__file__).with_name('parser_worker.py')), str(source.resolve()),
                   filename, mime, str(output), str(status), mode]
        if getattr(sys, 'frozen', False):
            command = [sys.executable, '--parser-worker', *command[3:]]
        process = start_process(command, env)
        deadline = monotonic() + timeout
        next_memory_check = 0.0
        parser_failure = None
        try:
            while process.poll() is None:
                check()
                if cancel():
                    raise ParserCancelled()
                if monotonic() > deadline:
                    raise ValueError('PARSER_TIMEOUT')
                if sys.platform == 'darwin' and monotonic() >= next_memory_check:
                    if darwin_group_memory(process.pid) > MEMORY_BYTES:
                        raise ValueError('PARSER_MEMORY_LIMIT')
                    next_memory_check = monotonic() + .2
                if status.is_file():
                    try:
                        done, total = map(int, status.read_text(encoding='ascii').split('/'))
                        progress(done, total)
                    except (OSError, ValueError):
                        pass
                try:
                    process.wait(timeout=.05)
                except subprocess.TimeoutExpired:
                    pass
            check()
            if cancel():
                raise ParserCancelled()
            if process.returncode != 0 or not output.is_file() or output.stat().st_size > 64 * 1024 * 1024:
                raise ValueError('PARSER_FAILED')
            pages = []
            with output.open(encoding='utf-8') as stream:
                for line in stream:
                    check()
                    value = json.loads(line)
                    if value.get('deferred'):
                        return []
                    pages.append(value)
            progress(len(pages), len(pages))
            return pages
        except BaseException as exc:
            parser_failure = exc
            raise
        finally:
            try:
                stop_parser(process)
                process.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired) as exc:
                if parser_failure is not None:
                    raise OSError('PARSER_CLEANUP_FAILED') from parser_failure
                raise OSError('PARSER_CLEANUP_FAILED') from exc


def parse_path(source: Path, filename: str, mime: str, *, inline=False, **kwargs) -> list[ExtractedPage]:
    return [ExtractedPage(**value) for value in _run_parser(source, filename, mime,
                                                         mode='inline' if inline else 'background', **kwargs)]


def parse_bookmarks(source: Path, check=lambda: None):
    values = _run_parser(source, source.name, 'application/pdf', mode='outline', check=check)
    return values[0]['bookmarks'] if values else []


def prepare_pages(data: bytes, filename: str, mime: str, check=lambda: None):
    if Path(filename).suffix.lower() not in TEXT_SUFFIXES | {'.pdf', '.pptx', '.docx'} and not mime.startswith('text/') and mime != 'application/pdf':
        return []
    if len(data) > 8 * 1024 * 1024:
        return []  # Committed large versions are discovered by the background worker.
    with TemporaryDirectory(prefix='unios-input-') as folder:
        source = Path(folder) / 'source'
        source.write_bytes(data)
        return parse_path(source, filename, mime, inline=True, check=check)
