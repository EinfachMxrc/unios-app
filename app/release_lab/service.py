# SPDX-License-Identifier: AGPL-3.0-or-later
"""Execute trusted synthetic gates and independently verify their evidence."""

import json
import math
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from xml.etree import ElementTree

from app.release_lab.catalog import MANUAL_GATES, MISSIONS, SUITES
from app.release_lab.contracts import (
    AgentObservation,
    FixtureBudget,
    GateResult,
    ReleaseReport,
)
from app.release_lab.repository import (
    artifact,
    safe_child,
    verify_artifact,
    write_report,
)

LOG_BUDGET = 512_000
RETRIEVAL_BASELINE = {"recall_at_5": .98, "recall_at_20": .98, "mrr": .98}


def isolated_environment(home: Path) -> dict[str, str]:
    """Do not propagate tokens, connector URLs, PYTHONPATH or personal settings."""
    environment = {key: os.environ[key] for key in ("PATH", "SystemRoot", "WINDIR", "COMSPEC",
                                                   "PROCESSOR_ARCHITECTURE", "PROCESSOR_ARCHITEW6432") if key in os.environ}
    environment.update({"HOME": str(home), "USERPROFILE": str(home), "APPDATA": str(home / "roaming"),
                        "LOCALAPPDATA": str(home / "appdata"), "TEMP": str(home), "TMP": str(home),
                        "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONNOUSERSITE": "1",
                        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "NO_COLOR": "1",
                        "UNIOS_FACTORY_ONLY": "true"})
    return environment


def execute(command: list[str], cwd: Path, home: Path, timeout: int) -> tuple[int, bytes, float]:
    start = time.monotonic()
    process = subprocess.Popen(command, cwd=cwd, env=isolated_environment(home), stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False)
    captured = bytearray()
    truncated = False

    def drain() -> None:
        nonlocal truncated
        assert process.stdout is not None
        while block := process.stdout.read(8192):
            available = LOG_BUDGET - len(captured)
            captured.extend(block[:available])
            truncated |= len(block) > available

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        code = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)
        code = 124
    reader.join(timeout=2)
    if reader.is_alive():
        # Descendants retaining the output pipe are not evidence of success.
        code = 124
    suffix = b"\n[output budget reached]\n" if truncated else b""
    return code, bytes(captured) + suffix, time.monotonic() - start


def junit_gate(gate_id: str, code: int, content: bytes, duration: float) -> GateResult:
    if len(content) > 2_000_000 or b"\0" in content or b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        return GateResult(id=gate_id, status="blocked", reason="Invalid or over-budget JUnit evidence")
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError:
        return GateResult(id=gate_id, status="blocked", reason="Unreadable JUnit evidence")
    if root.tag not in ("testsuites", "testsuite"):
        return GateResult(id=gate_id, status="blocked", reason="Not a JUnit suite")
    cases = list(root.iter("testcase"))
    failures = sum(any(case.find(name) is not None for name in ("failure", "error")) for case in cases)
    # A collection/setup error outside a testcase cannot disappear from the gate.
    failures = max(failures, len(list(root.iter("failure"))) + len(list(root.iter("error"))))
    skipped = sum(case.find("skipped") is not None for case in cases)
    passed = code == 0 and failures == 0 and len(cases) > skipped
    return GateResult(id=gate_id, status="passed" if passed else "failed", exit_code=code,
                      tests=len(cases), failures=failures, skipped=skipped,
                      duration_seconds=duration, reason="" if passed else "Exit status, failures or empty/all-skipped suite")


def verify_report(root: Path, report: ReleaseReport) -> dict[str, object]:
    artifacts = {item.id: item for item in report.artifacts}
    if len(artifacts) != len(report.artifacts):
        raise ValueError("Duplicate artifact IDs")
    verified = {key: verify_artifact(root, item) for key, item in artifacts.items()}
    checks: list[dict[str, object]] = []
    for gate in report.gates:
        if not gate.evidence or any(key not in verified for key in gate.evidence):
            checks.append({"gate": gate.id, "verified": False, "reason": "No verifiable evidence"})
            continue
        junit = next((key for key in gate.evidence if artifacts[key].kind == "junit"), None)
        if junit:
            replay = junit_gate(gate.id, gate.exit_code if gate.exit_code is not None else -1,
                                verified[junit], gate.duration_seconds)
            match = (replay.status, replay.tests, replay.failures, replay.skipped) == (
                gate.status, gate.tests, gate.failures, gate.skipped)
        elif gate.id == "retrieval-benchmark":
            key = next((key for key in gate.evidence if artifacts[key].kind == "retrieval_metrics"), None)
            match = key is not None and retrieval_status(json.loads(verified[key])) == gate.status and gate.exit_code == 0
        else:
            match = False
        checks.append({"gate": gate.id, "verified": match})
    return {"schema_version": 1, "artifact_hashes_verified": len(verified), "gates": checks,
            "evidence_consistent": all(item["verified"] for item in checks),
            "release_ready": False,
            "reason": "Hardware and external-user gates require separately collected evidence"}


def retrieval_status(metrics: dict[str, object]) -> Literal["passed", "failed", "blocked"]:
    # Thresholds are deliberately fixed, not supplied by agents or report authors.
    required = ("cases", "recall_at_5", "recall_at_20", "mrr", "forbidden_sources", "stale_versions",
                "source_hash_mismatches", "citation_hash_mismatches")
    numbers: dict[str, float] = {}
    for key in required:
        value = metrics.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            return "blocked"
        numbers[key] = float(value)
    if any(not 0 <= numbers[key] <= 1 for key in ("recall_at_5", "recall_at_20", "mrr")):
        return "blocked"
    return "passed" if (numbers["cases"] >= 100 and numbers["recall_at_5"] >= .95
                        and numbers["recall_at_20"] >= .99 and numbers["mrr"] >= .90
                        and all(numbers[key] >= value for key, value in RETRIEVAL_BASELINE.items())
                        and all(numbers[key] == 0 for key in ("forbidden_sources", "stale_versions",
                                                             "source_hash_mismatches", "citation_hash_mismatches"))) else "failed"


def run_lab(root: Path, output: Path, suites: list[str], budget: FixtureBudget,
            timeout: int = 900, include_retrieval: bool = True) -> ReleaseReport:
    if not 30 <= timeout <= 1800 or not suites or len(suites) != len(set(suites)) or any(key not in SUITES for key in suites):
        raise ValueError("Unknown/duplicate suite or invalid execution budget")
    root = root.resolve()
    if not (root / "AGENTS.md").is_file() or not (root / "pyproject.toml").is_file():
        raise ValueError("Expected UniOS source checkout")
    for part in output.resolve().parts:
        if part in ("data", "local", ".env", ".ssh"):
            raise ValueError("Report directory cannot be private application storage")
    output.mkdir(parents=True, exist_ok=False)
    gates, artifacts = [], []
    with tempfile.TemporaryDirectory(prefix="unios-release-lab-") as temporary:
        work = Path(temporary)
        home = work / "home"
        home.mkdir()
        for suite in suites:
            junit = work / (suite + ".xml")
            command = [sys.executable, "-m", "pytest", *SUITES[suite], "-q", "--basetemp",
                       str(work / suite), "--junitxml", str(junit)]
            try:
                code, log, duration = execute(command, root, home, timeout)
                log = log.replace(str(root).encode(), b"<source>").replace(str(work).encode(), b"<synthetic-workspace>")
                evidence = [artifact(output, suite + "-log", "evidence/" + suite + ".txt", "command_log", log)]
                if junit.exists() and junit.stat().st_size <= 2_000_000:
                    content = junit.read_bytes()
                    # Paths in the XML can contain the ephemeral workspace; remove them before hashing.
                    content = content.replace(str(root).encode(), b"source").replace(str(work).encode(), b"synthetic-workspace")
                    evidence.append(artifact(output, suite + "-junit", "evidence/" + suite + ".xml", "junit", content))
                    gate = junit_gate(suite, code, content, duration)
                else:
                    gate = GateResult(id=suite, status="blocked", exit_code=code, duration_seconds=duration,
                                      reason="No bounded JUnit evidence; timeout or runner failure")
                gate.evidence = [item.id for item in evidence]
                artifacts.extend(evidence)
                gates.append(gate)
            except OSError:
                gates.append(GateResult(id=suite, status="blocked", reason="Runner unavailable"))
        if include_retrieval:
            destination = work / "retrieval.json"
            command = [sys.executable, "-m", "app.release_lab.worker", str(destination), budget.model_dump_json()]
            code, log, duration = execute(command, root, home, timeout)
            evidence = [artifact(output, "retrieval-log", "evidence/retrieval.txt", "command_log", log)]
            if code == 0 and destination.exists() and destination.stat().st_size <= 2_000_000:
                content = destination.read_bytes()
                metrics = json.loads(content)
                evidence.append(artifact(output, "retrieval-metrics", "evidence/retrieval.json", "retrieval_metrics", content))
                status = retrieval_status(metrics)
            else:
                status = "blocked"
            gates.append(GateResult(id="retrieval-benchmark", status=status, exit_code=code,
                                    duration_seconds=duration, evidence=[item.id for item in evidence]))
            artifacts.extend(evidence)
    revision_result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, env=isolated_environment(output),
                                     capture_output=True, check=False, timeout=10)
    revision = revision_result.stdout.decode().strip()
    if not re.fullmatch(r"[0-9a-f]{40,64}", revision):
        revision = "unavailable"
    report = ReleaseReport(run_id=uuid.uuid4().hex, created_at=datetime.now(UTC).isoformat(), revision=revision,
                           gates=gates, artifacts=artifacts, manual_gates=MANUAL_GATES,
                           limitations=["Trusted source tests in clean environment; not an operating-system sandbox",
                                        "No external AI mission, visual review or hardware test was executed by this runner",
                                        "Corpus fixture text is synthetic; payload measurement uses bytes, not model tokens",
                                        "Revision identifies HEAD; a source checkout may contain uncommitted changes"])
    write_report(output, report)
    verification = json.dumps(verify_report(output, report), ensure_ascii=False, indent=2)
    with (output / "verification.json").open("x", encoding="utf-8") as stream:
        stream.write(verification + "\n")
    write_issue_drafts(output, report)
    return report


def validate_observations(root: Path, report: ReleaseReport, observations: list[AgentObservation]) -> dict[str, str]:
    """Collect three independent roles; claims remain explicitly attributed."""
    if not verify_report(root, report)["evidence_consistent"]:
        raise ValueError("Deterministic report evidence is inconsistent")
    artifacts = {item.id for item in report.artifacts}
    missions = {mission.id: mission for mission in MISSIONS}
    groups: dict[str, list[AgentObservation]] = {}
    for observation in observations:
        mission = missions.get(observation.mission_id)
        if mission is None or any(key not in artifacts for key in observation.evidence):
            raise ValueError("Unknown mission or evidence")
        if observation.actions > mission.budget_actions or observation.elapsed_seconds > mission.budget_seconds:
            raise ValueError("Mission action/time budget exceeded")
        groups.setdefault(mission.id, []).append(observation)
    statuses = {mission.id: "not_run" for mission in MISSIONS}
    gates = {gate.id: gate for gate in report.gates}
    for mission_id, group in groups.items():
        if len({item.role for item in group}) != len(group) or len({item.agent_id for item in group}) != len(group):
            raise ValueError("Tester, verifier and UX reviewer must be independent identities, one report each")
        if len(group) != 3:
            statuses[mission_id] = "incomplete_roles"
        elif any(item.conclusion != "passed" for item in group):
            statuses[mission_id] = "agent_reported_problem"
        elif missions[mission_id].requires_real_device:
            statuses[mission_id] = "manual_device_evidence_required"
        elif gates.get(missions[mission_id].gate) is None or gates[missions[mission_id].gate].status != "passed":
            statuses[mission_id] = "deterministic_gate_not_passed"
        else:
            statuses[mission_id] = "agent_claims_with_checked_evidence"
    return statuses


def write_issue_drafts(root: Path, report: ReleaseReport) -> None:
    directory = root / "issue-drafts"
    directory.mkdir(exist_ok=False)
    for gate in report.gates:
        if gate.status not in ("failed", "blocked"):
            continue
        content = (f"# [Release Lab] {gate.id}: {gate.status}\n\n"
                   f"Revision: `{report.revision}`\nRun: `{report.run_id}`\n\n"
                   "## Erwartet\n\nSynthetischer Gate-Lauf mit überprüfbaren Ergebnissen.\n\n"
                   f"## Beobachtet\n\nStatus: {gate.status}; Tests: {gate.tests}; Fehler: {gate.failures}; "
                   f"übersprungen: {gate.skipped}.\n{gate.reason}\n\n"
                   "## Belege\n\n" + "\n".join("- " + key for key in gate.evidence)
                   + "\n\nLokaler Entwurf. Vor Veröffentlichung prüfen; es wurde kein Issue versendet.\n")
        target = safe_child(directory, gate.id + ".md")
        with target.open("x", encoding="utf-8") as stream:
            stream.write(content)
