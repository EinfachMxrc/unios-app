# SPDX-License-Identifier: AGPL-3.0-or-later

"""Audit the built app with current Accessibility and legacy PWA scores."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
REPORTS = FRONTEND / "test-results" / "lighthouse"
URL = "http://127.0.0.1:4173/"
FAKE_HEALTH = "http://127.0.0.1:8173/health"


def local_path(value: str) -> str:
    """Keep audit navigation on the local preview origin."""
    if (not value or value.startswith("//") or "\\" in value
            or any(ord(character) <= 32 or ord(character) == 127 for character in value)):
        raise argparse.ArgumentTypeError("--path braucht einen lokalen Seitenpfad, z. B. /material/1")
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        raise argparse.ArgumentTypeError("--path darf keine fremde URL enthalten")
    return value if value.startswith("/") else f"/{value}"


def report_suffix(path: str) -> str:
    if path == "/":
        return ""
    name = re.sub(r"[^a-zA-Z0-9_-]+", "-", urlsplit(path).path).strip("-")[:60] or "home"
    digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:10]
    return f"-{name}-{digest}"


def run(command: list[str], *, cwd: Path = FRONTEND, env: dict[str, str] | None = None) -> None:
    # Windows npm is a .cmd shim; resolve PATHEXT before CreateProcess.
    command = [shutil.which(command[0]) or command[0], *command[1:]]
    subprocess.run(command, cwd=cwd, env=env, check=True)


def run_lighthouse(command: list[str], report: Path, environment: dict[str, str]) -> None:
    started = time.time()
    result = subprocess.run(command, cwd=FRONTEND, env=environment, capture_output=True,
                            text=True, encoding="utf-8", errors="replace", check=False)
    if result.returncode == 0:
        return
    # Chrome Launcher sometimes cannot remove its just-closed temporary profile
    # on Windows even though Lighthouse has already written a complete report.
    if (sys.platform == "win32" and "Launcher.destroyTmp" in result.stderr
            and report.is_file() and report.stat().st_mtime >= started):
        print("Lighthouse-Bericht erstellt; Chrome-Profil war beim Aufräumen noch gesperrt.", file=sys.stderr)
        return
    raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "Lighthouse fehlgeschlagen")


def wait_for_preview(process: subprocess.Popen, url: str) -> None:
    for _ in range(60):
        if process.poll() is not None:
            raise RuntimeError(f"Lokaler Testserver konnte nicht starten: {url}")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            pass
        time.sleep(1)
    raise RuntimeError(f"Lokaler Testserver antwortet nicht: {url}")


def stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def score(report: Path, category: str) -> int:
    payload = json.loads(report.read_text(encoding="utf-8"))
    return round(payload["categories"][category]["score"] * 100)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fake-data", action="store_true", help="lokalen Fake-Server starten")
    parser.add_argument("--accessibility-only", action="store_true", help="Legacy-PWA-Lauf auslassen")
    parser.add_argument("--skip-build", action="store_true", help="bereits gebautes Frontend prüfen")
    parser.add_argument("--study-fixture", action="store_true",
                        help="synthetische Anki-Stapel im lokalen Fake-Server vorbereiten")
    parser.add_argument("--path", type=local_path, default="/",
                        help="lokaler Seitenpfad, z. B. /material/1 (Standard: /)")
    args = parser.parse_args()
    audit_url = f"{URL.rstrip('/')}{args.path}"
    report_name_suffix = report_suffix(args.path)
    route_label = "" if args.path == "/" else f" ({args.path})"
    if not args.fake_data:
        raise RuntimeError("Qualitätsprüfung nur mit --fake-data starten")
    if not shutil.which("npm"):
        raise RuntimeError("npm fehlt")
    chrome = os.environ.get("CHROME_PATH")
    if not chrome:
        if sys.platform == "darwin":
            chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        elif sys.platform == "win32":
            chrome = str(Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe")
        else:
            chrome = shutil.which("google-chrome") or shutil.which("chromium")
    if not chrome or not Path(chrome).is_file():
        raise RuntimeError("Chrome fehlt; CHROME_PATH auf die Chrome-Datei setzen")
    REPORTS.mkdir(parents=True, exist_ok=True)
    if not args.skip_build:
        run(["npm", "run", "build"])
    if not (FRONTEND / "dist" / "index.html").is_file():
        raise RuntimeError("Frontend-Build fehlt; ohne --skip-build erneut starten")
    suffix = ".cmd" if sys.platform == "win32" else ""
    latest = FRONTEND / "node_modules" / ".bin" / f"lighthouse{suffix}"
    if not latest.is_file():
        raise RuntimeError("Lighthouse fehlt; im Frontend npm ci ausführen")
    legacy: Path | None = None
    if not args.accessibility_only:
        legacy = REPORTS / "lighthouse11" / "node_modules" / ".bin" / f"lighthouse{suffix}"
        if not legacy.is_file():
            run(["npm", "install", "--prefix", str(REPORTS / "lighthouse11"), "lighthouse@11.7.1", "--no-save"])
    environment = {**os.environ, "CHROME_PATH": str(chrome)}
    backend: subprocess.Popen | None = None
    preview: subprocess.Popen | None = None
    with (REPORTS / f"fake-api{report_name_suffix}.log").open("w", encoding="utf-8") as backend_log, \
            (REPORTS / f"preview{report_name_suffix}.log").open("w", encoding="utf-8") as preview_log:
        try:
            if args.fake_data:
                backend = subprocess.Popen(
                    [sys.executable, "-m", "uvicorn", "tests.fake_servers.phase1_app:app",
                     "--host", "127.0.0.1", "--port", "8173"],
                    cwd=ROOT, stdout=backend_log, stderr=subprocess.STDOUT,
                )
                wait_for_preview(backend, FAKE_HEALTH)
                if args.study_fixture:
                    seed = Request("http://127.0.0.1:8173/api/__test__/study-deck-scenario",
                                   data=b"", method="POST")
                    with urlopen(seed, timeout=30) as response:
                        fixture = json.load(response)
                    if fixture.get("total_cards") != 104 or fixture.get("deck_b", {}).get("name") != "Uni::B":
                        raise RuntimeError("Synthetische Lernstapel konnten nicht vorbereitet werden")
                environment["UNIOS_API_TARGET"] = "http://127.0.0.1:8173"
            preview = subprocess.Popen(
                [shutil.which("node") or "node", str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"),
                 "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
                cwd=FRONTEND, env=environment, stdout=preview_log, stderr=subprocess.STDOUT,
            )
            wait_for_preview(preview, URL)
            latest_report = REPORTS / f"lighthouse-accessibility{report_name_suffix}.json"
            common = [audit_url, "--output=json", "--chrome-flags=--headless", "--quiet"]
            run_lighthouse([str(latest), *common,
                            "--only-categories=accessibility", f"--output-path={latest_report}"],
                           latest_report, environment)
            accessibility = score(latest_report, "accessibility")
            print(f"Lighthouse Accessibility{route_label}: {accessibility}")
            if legacy is None:
                return 0 if accessibility >= 90 else 1
            legacy_report = REPORTS / f"lighthouse-pwa-legacy{report_name_suffix}.json"
            run_lighthouse([str(legacy), *common, "--only-categories=pwa", f"--output-path={legacy_report}"],
                           legacy_report, environment)
            pwa = score(legacy_report, "pwa")
            print(f"Lighthouse 11 PWA{route_label}: {pwa}")
            return 0 if accessibility >= 90 and pwa >= 90 else 1
        finally:
            stop(preview)
            stop(backend)


if __name__ == "__main__":
    raise SystemExit(main())
