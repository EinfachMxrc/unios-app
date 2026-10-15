# SPDX-License-Identifier: AGPL-3.0-or-later
"""Opt-in local release gates; never publish model findings automatically."""

import argparse
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.release_lab.catalog import MISSIONS, PERSONAS, SUITES
from app.release_lab.contracts import AgentObservation, FixtureBudget
from app.release_lab.publishing import REPOSITORY, publish_issues
from app.release_lab.repository import read_report
from app.release_lab.service import (
    run_lab,
    validate_observations,
    verify_report,
)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    parser = argparse.ArgumentParser(description="UniOS Release Lab: echte synthetische Gates, getrennte Agentenbelege")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("missions", help="Ziele und Personas für unabhängige Tester anzeigen")
    run = commands.add_parser("run", help="Feste lokale Tests und Corpus-Benchmark ausführen")
    run.add_argument("--output", type=Path, required=True, help="Neuer Berichtsordner; bestehende Ordner werden nie überschrieben")
    run.add_argument("--suite", action="append", choices=sorted(SUITES))
    run.add_argument("--documents", type=int, default=100)
    run.add_argument("--courses", type=int, default=12)
    run.add_argument("--semesters", type=int, default=4)
    run.add_argument("--timeout", type=int, default=900)
    run.add_argument("--skip-retrieval", action="store_true")
    verify = commands.add_parser("verify", help="Hashes und Gate-Ergebnisse unabhängig prüfen")
    verify.add_argument("report", type=Path)
    record = commands.add_parser("record", help="Externe KI-Beobachtungen mit vorhandenen Belegen prüfen und versioniert sammeln")
    record.add_argument("report", type=Path)
    record.add_argument("observations", type=Path)
    publish = commands.add_parser("publish-issues", help="Geprüfte fehlgeschlagene Gates nach bewusster Bestätigung als GitHub-Issues veröffentlichen")
    publish.add_argument("report", type=Path)
    publish.add_argument("--confirm", action="store_true")
    publish.add_argument("--repo", default=REPOSITORY, choices=[REPOSITORY])
    arguments = parser.parse_args()
    if arguments.command == "missions":
        print(json.dumps({"schema_version": 1, "personas": [item.model_dump() for item in PERSONAS],
                          "missions": [item.model_dump() for item in MISSIONS],
                          "roles": ["tester", "verifier", "ux_reviewer"],
                          "ai_execution": "external_opt_in; this command does not call a model"}, ensure_ascii=False, indent=2))
        return 0
    if arguments.command == "run":
        report = run_lab(ROOT, arguments.output, arguments.suite or list(SUITES),
                         FixtureBudget(documents=arguments.documents, courses=arguments.courses, semesters=arguments.semesters),
                         timeout=arguments.timeout, include_retrieval=not arguments.skip_retrieval)
        print(json.dumps({"report": str(arguments.output / "report.json"),
                          "gates": {item.id: item.status for item in report.gates}, "ai_missions": "not_run",
                          "manual_gates": "not_run"}, ensure_ascii=False, indent=2))
        return 0 if all(gate.status == "passed" for gate in report.gates) else 1
    if arguments.command == "publish-issues":
        print(json.dumps(publish_issues(arguments.report, confirm=arguments.confirm, repository=arguments.repo),
                         ensure_ascii=False, indent=2))
        return 0
    report = read_report(arguments.report)
    if arguments.command == "verify":
        result = verify_report(arguments.report, report)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["evidence_consistent"] else 1
    if arguments.observations.stat().st_size > 1_000_000:
        raise ValueError("Observation budget exceeded")
    raw = json.loads(arguments.observations.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or len(raw) > 100:
        raise ValueError("Expected a bounded observation list")
    observations = [AgentObservation.model_validate(item) for item in raw]
    statuses = validate_observations(arguments.report, report, observations)
    target = arguments.report / ("agent-observations-" + uuid.uuid4().hex + ".json")
    with target.open("x", encoding="utf-8") as stream:
        json.dump({"schema_version": 1, "report_run_id": report.run_id, "mission_status": statuses,
                   "observations": [item.model_dump() for item in observations],
                   "interpretation": "Attributed external model claims, not proof of browser/device execution"},
                  stream, ensure_ascii=False, indent=2)
    print(json.dumps({"record": str(target), "mission_status": statuses}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
