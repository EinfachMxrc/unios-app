# SPDX-License-Identifier: AGPL-3.0-or-later
"""Explicit, metadata-only issue publication; ambiguous outcomes fail closed."""

import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

from filelock import FileLock

from app.release_lab.catalog import SUITES
from app.release_lab.repository import read_report, safe_child
from app.release_lab.service import verify_report

REPOSITORY = "EinfachMxrc/unios-app"
ISSUE_URL = re.compile(r"https://github\.com/EinfachMxrc/unios-app/issues/[1-9][0-9]*")


def _receipt(path: Path) -> dict:
    if path.stat().st_size > 20_000:
        raise ValueError("Invalid publication receipt")
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise TypeError("Invalid publication receipt")
    return result


def _write_receipt(path: Path, data: dict) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def publish_issues(root: Path, *, confirm: bool = False, repository: str = REPOSITORY) -> dict:
    if not confirm or repository != REPOSITORY:
        raise ValueError("Explicit confirmation and the configured UniOS repository are required")
    report = read_report(root)
    report_path = safe_child(root, "report.json")
    if report_path.stat().st_size > 2_000_000:
        raise ValueError("Report budget exceeded")
    report_hash = hashlib.sha256(report_path.read_bytes()).hexdigest()
    fingerprint = safe_child(root, "report.sha256")
    if fingerprint.stat().st_size > 100 or fingerprint.read_text(encoding="ascii").strip() != report_hash:
        raise ValueError("Release report changed after creation")
    if not verify_report(root, report)["evidence_consistent"]:
        raise ValueError("Release evidence is inconsistent")
    if not re.fullmatch(r"[0-9a-f]{32}", report.run_id) or not re.fullmatch(r"[0-9a-f]{40,64}", report.revision):
        raise ValueError("Publication requires a valid run and source revision")
    permitted = set(SUITES) | {"retrieval-benchmark"}
    if any(gate.id not in permitted for gate in report.gates):
        raise ValueError("Unknown executable gate in publication report")
    published = []
    receipts = safe_child(root, "publish-receipts")
    receipts.mkdir(exist_ok=True)
    with FileLock(str(safe_child(root, "publish.lock")), timeout=0):
        for gate in report.gates:
            if gate.status not in ("failed", "blocked"):
                continue
            reference = report.run_id + "-" + gate.id
            intent = safe_child(receipts, reference + "-pending.json")
            completed = safe_child(receipts, reference + "-completed.json")
            if intent.exists():
                previous = _receipt(intent)
                if previous.get("report_hash") != report_hash or previous.get("reference") != reference:
                    raise ValueError("Publication receipt does not match the report")
                if not completed.exists():
                    raise RuntimeError("Previous publication outcome needs manual GitHub review; no duplicate issue was sent")
                done = _receipt(completed)
                url = done.get("url", "")
                if done.get("report_hash") != report_hash or done.get("reference") != reference or not isinstance(url, str) or not ISSUE_URL.fullmatch(url):
                    raise ValueError("Invalid completed publication receipt")
                published.append({"gate": gate.id, "url": url, "status": "already_published"})
                continue
            if completed.exists():
                raise ValueError("Completed receipt without publication intent")
            evidence = {item.id: item for item in report.artifacts}
            reproduction = "retrieval-contract" if gate.id == "retrieval-benchmark" else gate.id
            title = f"[Release Lab] {gate.id}: {gate.status}"
            # Only fixed strings, enum/counter fields, safe hashes and known gate IDs.
            # No external model summary, raw log, path, source text or reason is sent.
            body = (f"## Synthetischer Release-Gate-Lauf\n\nRevision: `{report.revision}`\n"
                    f"Run: `{report.run_id}`\nGate: `{gate.id}`\nStatus: `{gate.status}`\n\n"
                    f"Tests: {gate.tests}; Fehler: {gate.failures}; übersprungen: {gate.skipped}.\n\n"
                    "## Reproduktion\n\n"
                    f"`python scripts/release_lab.py run --suite {reproduction} --output .tmp/neuer-lab-bericht`\n\n"
                    "Die lokalen Belege wurden vor der Veröffentlichung erneut geprüft. "
                    "Dieser Bericht enthält keine Nutzertexte, Campusdaten oder Rohlogs.\n\n"
                    "## Beleg-Hashes\n\n"
                    + "\n".join(f"- `{key}`: `{evidence[key].sha256}`" for key in gate.evidence)
                    + f"\n\nUniOS-Lab-Receipt: `{reference}`\n")
            metadata = {"schema_version": 1, "reference": reference, "report_hash": report_hash,
                        "repository": REPOSITORY, "state": "pending"}
            _write_receipt(intent, metadata)
            try:
                with tempfile.TemporaryDirectory(prefix="unios-issue-body-") as folder:
                    body_file = Path(folder) / "body.md"
                    with body_file.open("x", encoding="utf-8") as stream:
                        stream.write(body)
                    result = subprocess.run(["gh", "issue", "create", "--repo", REPOSITORY, "--title", title,
                                             "--body-file", str(body_file)], stdin=subprocess.DEVNULL,
                                            capture_output=True, text=True, encoding="utf-8", errors="replace",
                                            shell=False, check=False, timeout=60)
                if result.returncode != 0 or not ISSUE_URL.fullmatch(result.stdout.strip()):
                    raise RuntimeError("GitHub issue creation outcome is unclear; inspect the pending receipt manually")
                url = result.stdout.strip()
                _write_receipt(completed, {**metadata, "state": "completed", "url": url})
                published.append({"gate": gate.id, "url": url, "status": "published"})
            except (OSError, subprocess.TimeoutExpired):
                raise RuntimeError("GitHub issue creation failed; inspect the pending receipt manually") from None
    return {"schema_version": 1, "repository": REPOSITORY, "issues": published,
            "sent_count": sum(item["status"] == "published" for item in published)}
