# SPDX-License-Identifier: AGPL-3.0-or-later
"""Launch a real isolated demo process and exercise its first PDF and learning card."""
import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8001'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frozen', action='store_true', help='Prüft den lokal gebauten Windows-Begleitdienst')
    args = parser.parse_args()
    command = [sys.executable, '-m', 'desktop.backend', 'demo']
    if args.frozen:
        binary = ROOT / 'dist' / 'desktop-backend' / 'uniosd' / 'uniosd.exe'
        if os.name != 'nt' or not binary.is_file():
            raise RuntimeError('FROZEN_WINDOWS_BACKEND_UNAVAILABLE')
        command = [str(binary), 'demo']
    # Never attach to, terminate or test a pre-existing service/profile.
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 8001))
    environment = {key: value for key, value in os.environ.items() if key.casefold() in
                   {'systemroot', 'windir', 'path', 'temp', 'tmp', 'processor_architecture'}}
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='unios-demo-launch-') as temporary:
        home = Path(temporary)
        environment.update(UNIOS_HOME=str(home), PYTHONPATH=str(ROOT), SYNC_INTERVAL_MINUTES='invalid')
        with (home / 'synthetic-process.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=ROOT,
                                       env=environment, stdout=log, stderr=log,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            try:
                with httpx.Client(base_url=BASE, timeout=2, trust_env=False) as client:
                    ready = False
                    for _ in range(120):
                        if process.poll() is not None:
                            raise RuntimeError('DEMO_PROCESS_EXITED')
                        try:
                            ready = client.get('/health').status_code == 200
                        except httpx.HTTPError:
                            pass
                        if ready:
                            break
                        time.sleep(.5)
                    if not ready:
                        raise RuntimeError('DEMO_START_TIMEOUT')
                    assert client.get('/api/recovery/status').json()['mode'] == 'demo'
                    assert len(client.get('/api/courses').json()['courses']) == 4
                    assert client.get('/api/anki/study/status').json()['cards'] == 15
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(channel='chrome')
                    try:
                        page = browser.new_page(viewport={'width': 1440, 'height': 900})
                        page.goto(BASE)
                        page.get_by_role('heading', name='Heute', exact=True).wait_for()
                        page.get_by_role('link', name='Kurs öffnen').first.click()
                        page.locator('.course-list-row').filter(has_text='Programmieren 1').click()
                        page.get_by_role('link', name='PDF öffnen').first.click()
                        page.locator('[data-material-page="1"] .react-pdf__Page__textContent').wait_for()
                        assert 'Schleifen' in page.locator('[data-material-page="1"]').inner_text()
                        page.goto(BASE + '/study')
                        page.get_by_role('heading', name='Karteikarten', exact=True).wait_for()
                        page.locator('.study-deck-link').first.click()
                        page.get_by_role('button', name='Antwort zeigen').click()
                        with page.expect_response(lambda response: response.url.endswith('/api/anki/study/reviews') and response.request.method == 'POST') as saved:
                            page.get_by_role('button', name='3 · Gut', exact=True).click()
                        assert saved.value.ok
                        assert page.request.get(BASE + '/api/anki/study/status').json()['reviews'] == 1
                    except Exception:
                        # This browser is restricted to the newly generated synthetic profile.
                        page.screenshot(path=str(ROOT / '.tmp/demo-smoke-failure.png'), full_page=True)
                        (ROOT / '.tmp/demo-smoke-failure.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                        (ROOT / '.tmp/demo-smoke-status.json').write_text(json.dumps(page.request.get(BASE + '/api/anki/study/due').json()), encoding='utf-8')
                        raise
                    finally:
                        browser.close()
                print(json.dumps({'status': 'passed', 'duration_seconds': round(time.monotonic() - started, 2),
                                  'process': 'frozen Windows backend' if args.frozen else 'source desktop backend', 'isolated': True,
                                  'pdf_rendered': True, 'card_review_saved': True,
                                  'fresh_os_installer': False}))
            finally:
                if os.name == 'nt' and args.frozen and process.poll() is None:
                    # Stop only processes owned by this freshly launched demo.
                    subprocess.run(['taskkill.exe', '/PID', str(process.pid), '/T', '/F'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   timeout=15, check=False)
                else:
                    process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
