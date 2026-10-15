# SPDX-License-Identifier: AGPL-3.0-or-later
"""Evidence must reflect real failures, budgets, independent claims and isolation."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.release_lab.catalog import MISSIONS
from app.release_lab.contracts import (
    AgentObservation,
    FixtureBudget,
    Mission,
    ReleaseReport,
)
from app.release_lab.publishing import publish_issues
from app.release_lab.repository import (
    artifact,
    read_report,
    safe_child,
    verify_artifact,
    write_report,
)
from app.release_lab.service import (
    execute,
    isolated_environment,
    junit_gate,
    retrieval_status,
    run_lab,
    validate_observations,
    verify_report,
)
from app.release_lab.worker import SyntheticSettings, benchmark, fixture_documents

SOURCE = Path(__file__).resolve().parents[1]
FIXTURE = SOURCE / "tests" / "fixtures" / "agent" / "retrieval.json"
PASS = b'<testsuites><testsuite tests="1"><testcase name="real-result"/></testsuite></testsuites>'
FAIL = b'<testsuites><testsuite tests="1"><testcase name="failed-result"><failure>broken</failure></testcase></testsuite></testsuites>'


def report_with_evidence(root, content=PASS, code=0):
    item = artifact(root, "retrieval-junit", "evidence/result.xml", "junit", content)
    gate = junit_gate("retrieval-contract", code, content, 1.0)
    gate.evidence = [item.id]
    return ReleaseReport(run_id="synthetic-run", created_at="2026-01-01T00:00:00Z", revision="synthetic-revision",
                         gates=[gate], artifacts=[item], manual_gates=["hardware"], limitations=["synthetic test"])


@pytest.mark.parametrize("xml,code,status", [
    (PASS, 0, "passed"), (FAIL, 0, "failed"), (PASS, 1, "failed"),
    (b'<testsuites><testsuite><testcase><skipped/></testcase></testsuite></testsuites>', 0, "failed"),
    (b'<testsuites/>', 0, "failed"), (b'<broken', 0, "blocked"),
    (b'<!DOCTYPE dangerous><testsuites/>', 0, "blocked"), (PASS, 124, "failed"),
    (b'<testsuite><testcase/><error>collection failed</error></testsuite>', 0, "failed"),
    (b'<anything><testcase/></anything>', 0, "blocked"),
    (PASS.decode().encode("utf-16"), 0, "blocked"),
])
def test_no_empty_skipped_timeout_or_failed_gate_can_pass(xml, code, status):
    assert junit_gate("probe", code, xml, .2).status == status


def test_artifact_paths_hashes_and_exclusive_writes(tmp_path):
    root = tmp_path / "reports"
    root.mkdir()
    report = report_with_evidence(root)
    assert verify_report(root, report)["evidence_consistent"] is True
    assert verify_report(root, report)["release_ready"] is False
    write_report(root, report)
    assert read_report(root) == report
    with pytest.raises(FileExistsError):
        write_report(root, report)
    with pytest.raises(FileExistsError):
        artifact(root, "duplicate", "evidence/result.xml", "junit", PASS)
    with pytest.raises(ValueError):
        artifact(root, "large", "large.txt", "command_log", b"x" * 2_000_001)
    for path in ("../outside", "data/student.pdf", "local/database", str(tmp_path / "absolute")):
        with pytest.raises(ValueError):
            safe_child(root, path)
    (root / "evidence/result.xml").write_bytes(b"tampered")
    with pytest.raises(ValueError, match="size mismatch"):
        verify_report(root, report)


def test_same_size_tamper_and_gate_status_forgery_are_detected(tmp_path):
    report = report_with_evidence(tmp_path, FAIL)
    report.gates[0].status = "passed"
    assert verify_report(tmp_path, report)["evidence_consistent"] is False
    (tmp_path / report.artifacts[0].path).write_bytes(FAIL.replace(b"broken", b"forged"))
    with pytest.raises(ValueError, match="hash mismatch"):
        verify_artifact(tmp_path, report.artifacts[0])


def test_contracts_refuse_shell_actions_unknown_fields_and_over_budget():
    mission = MISSIONS[1].model_dump()
    with pytest.raises(ValidationError):
        Mission.model_validate({**mission, "command": "arbitrary shell command"})
    with pytest.raises(ValidationError):
        FixtureBudget(documents=50_001)
    with pytest.raises(ValidationError):
        FixtureBudget(pages_per_document=11)
    with pytest.raises(ValidationError):
        FixtureBudget(documents="100")


def test_catalog_has_four_work_goals_and_bounded_external_chaos_mission():
    by_id = {mission.id: mission for mission in MISSIONS}
    assert len(by_id) == len(MISSIONS)
    for key in ("work-next-lecture", "work-week-review", "work-exam-weaknesses", "work-chapter-practice"):
        assert key in by_id and by_id[key].requires_real_device is False
    chaos = by_id["chaos-monkey"]
    assert chaos.budget_seconds == 1800 and chaos.budget_actions == 300
    assert chaos.requires_real_device is False and chaos.gate == "recovery"


def test_child_environment_and_settings_cannot_use_personal_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv("PROCESSOR_ARCHITECTURE", "AMD64")
    for key, value in {"MOODLE_TOKEN": "invented-sensitive-value", "DATABASE_URL": "sqlite:///private-protected",
                       "UNIOS_SERVER_KEY": "private-protected", "PYTHONPATH": "private-protected",
                       "AI_ADAPTER_API_KEY": "invented-sensitive-value"}.items():
        monkeypatch.setenv(key, value)
    environment = isolated_environment(tmp_path)
    assert "MOODLE_TOKEN" not in environment and "UNIOS_SERVER_KEY" not in environment and "PYTHONPATH" not in environment
    assert environment["UNIOS_FACTORY_ONLY"] == "true"
    assert environment["PROCESSOR_ARCHITECTURE"] == "AMD64"
    (tmp_path / ".env").write_text("MOODLE_TOKEN=invented-dotenv\nDATABASE_URL=sqlite:///private-protected", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    def deny_dotenv_read(*args, **kwargs):
        pytest.fail("Synthetic settings attempted to read a dotenv file")
    monkeypatch.setattr("pydantic_settings.sources.providers.dotenv.dotenv_values", deny_dotenv_read)
    settings = SyntheticSettings(data_dir=tmp_path / "shared", local_dir=tmp_path / "private")
    assert settings.moodle_token == ""
    assert str(tmp_path / "private") in settings.database_url
    code, output, _ = execute([sys.executable, "-c", "import os; print(os.environ.get('MOODLE_TOKEN', 'absent'))"],
                              SOURCE, tmp_path, 10)
    assert code == 0 and output.strip() == b"absent"


def test_subprocess_timeout_and_log_budget(tmp_path):
    code, output, _ = execute([sys.executable, "-c", "print('x' * 600000)"], SOURCE, tmp_path, 10)
    assert code == 0 and len(output) < 513_000 and b"output budget reached" in output
    code, _, duration = execute([sys.executable, "-c", "import time; time.sleep(20)"], SOURCE, tmp_path, 1)
    assert code == 124 and duration < 12


@pytest.mark.parametrize("mutation,expected", [
    ({"recall_at_5": .94}, "failed"), ({"forbidden_sources": 1}, "failed"), ({"stale_versions": 1}, "failed"),
    ({"cases": 99}, "failed"), ({"mrr": float("nan")}, "blocked"), ({"recall_at_5": 2}, "blocked"),
    ({"cases": True}, "blocked"), ({"mrr": "1"}, "blocked"),
    ({"source_hash_mismatches": 1}, "failed"), ({"citation_hash_mismatches": 1}, "failed"),
    ({"recall_at_5": .97}, "failed"),
])
def test_retrieval_regressions_permissions_staleness_and_invalid_metrics_block(mutation, expected):
    metrics = {"cases": 100, "recall_at_5": 1, "recall_at_20": 1, "mrr": 1, "forbidden_sources": 0, "stale_versions": 0,
               "source_hash_mismatches": 0, "citation_hash_mismatches": 0}
    assert retrieval_status(metrics) == "passed"
    assert retrieval_status({**metrics, **mutation}) == expected


def observation(role, **overrides):
    return AgentObservation.model_validate({"mission_id": "find-source", "role": role, "agent_id": "external-" + role,
                                           "model": "supplied-test-model", "conclusion": "passed",
                                           "summary": "Synthetic external claim for the contract test",
                                           "evidence": ["retrieval-junit"], "elapsed_seconds": 30.0, "actions": 5, **overrides})


def test_three_roles_require_distinct_identities_valid_evidence_and_actual_gate(tmp_path):
    report = report_with_evidence(tmp_path)
    assert validate_observations(tmp_path, report, [])["find-source"] == "not_run"
    assert validate_observations(tmp_path, report, [observation("tester")])["find-source"] == "incomplete_roles"
    group = [observation(role) for role in ("tester", "verifier", "ux_reviewer")]
    assert validate_observations(tmp_path, report, group)["find-source"] == "agent_claims_with_checked_evidence"
    group[1].conclusion = "failed"
    assert validate_observations(tmp_path, report, group)["find-source"] == "agent_reported_problem"
    group[1].conclusion = "passed"
    group[1].agent_id = group[0].agent_id
    with pytest.raises(ValueError, match="independent"):
        validate_observations(tmp_path, report, group)
    for override in ({"evidence": ["not-present"]}, {"mission_id": "not-present"}, {"actions": 101}, {"elapsed_seconds": 601.0}):
        with pytest.raises(ValueError):
            validate_observations(tmp_path, report, [observation("tester", **override)])
    report.gates[0].status = "failed"
    with pytest.raises(ValueError, match="inconsistent"):
        validate_observations(tmp_path, report, [observation("tester")])
    failed_root = tmp_path / "failed"
    failed_root.mkdir()
    failed_report = report_with_evidence(failed_root, FAIL, code=1)
    statuses = validate_observations(failed_root, failed_report, [observation(role) for role in ("tester", "verifier", "ux_reviewer")])
    assert statuses["find-source"] == "deterministic_gate_not_passed"


def test_lab_uses_only_fixed_suites_records_failures_and_drafts_locally(tmp_path, monkeypatch):
    called = []

    def controlled(command, cwd, home, timeout):
        called.append(command)
        Path(command[command.index("--junitxml") + 1]).write_bytes(FAIL)
        return 1, b"synthetic failure", .3

    monkeypatch.setattr("app.release_lab.service.execute", controlled)
    output = tmp_path / "report"
    report = run_lab(SOURCE, output, ["retrieval-contract"], FixtureBudget(), include_retrieval=False)
    assert report.gates[0].status == "failed" and report.observations == []
    assert called[0][3] == "tests/test_agent_corpus.py"
    assert report.execution == "deterministic_synthetic"
    assert "kein Issue versendet" in (output / "issue-drafts/retrieval-contract.md").read_text(encoding="utf-8")
    assert json.loads((output / "verification.json").read_text())["evidence_consistent"] is True
    for suites in (["arbitrary-command"], ["pdf", "pdf"], []):
        with pytest.raises(ValueError):
            run_lab(SOURCE, tmp_path / "unused", suites, FixtureBudget(), include_retrieval=False)
    with pytest.raises(ValueError):
        run_lab(SOURCE, tmp_path / "data" / "report", ["pdf"], FixtureBudget())


def test_real_corpus_benchmark_indexes_latest_versions_and_enforces_denied_course(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///do-not-open-private")
    metrics = benchmark(FixtureBudget(documents=20, courses=4, semesters=2, pages_per_document=1), FIXTURE)
    assert metrics["cases"] == 100
    assert metrics["forbidden_sources"] == 0 and metrics["stale_versions"] == 0
    assert metrics["source_hash_mismatches"] == 0 and metrics["citation_hash_mismatches"] == 0
    assert metrics["baseline_comparison"]["metrics"]["recall_at_20"] == .98
    assert metrics["fixture"]["source_files_created"] is False
    assert metrics["index"]["pending"] == 0
    assert metrics["recall_at_5"] >= .95


def test_fixture_generator_bounds_text_before_database_import():
    documents, cases = fixture_documents(FixtureBudget(documents=1000), FIXTURE)
    assert len(documents) == 1000 and len(cases) == 100
    with pytest.raises(ValueError, match="budget"):
        fixture_documents(FixtureBudget(documents=1000, max_bytes=100_000), FIXTURE)


def publication_report(root, content=FAIL, code=1):
    report = report_with_evidence(root, content, code)
    report.run_id = "b" * 32
    report.revision = "a" * 40
    report.gates[0].reason = "PRIVATE_REASON_MUST_NOT_LEAVE"
    report.observations = [observation("tester", summary="PRIVATE_MODEL_SUMMARY_MUST_NOT_LEAVE")]
    write_report(root, report)
    return report


def test_issue_publishing_requires_confirmation_uses_metadata_only_and_is_idempotent(tmp_path, monkeypatch):
    publication_report(tmp_path)
    calls = []

    def fake_gh(command, **kwargs):
        calls.append(command)
        assert command[:5] == ["gh", "issue", "create", "--repo", "EinfachMxrc/unios-app"]
        assert kwargs["shell"] is False and kwargs["timeout"] == 60
        body = Path(command[command.index("--body-file") + 1]).read_text(encoding="utf-8")
        assert "PRIVATE_" not in body and "broken" not in body
        assert "übersprungen" in body and "UniOS-Lab-Receipt" in body
        return subprocess.CompletedProcess(command, 0, "https://github.com/EinfachMxrc/unios-app/issues/123\n", "")

    monkeypatch.setattr("app.release_lab.publishing.subprocess.run", fake_gh)
    with pytest.raises(ValueError, match="Explicit confirmation"):
        publish_issues(tmp_path)
    with pytest.raises(ValueError, match="configured"):
        publish_issues(tmp_path, confirm=True, repository="other/repo")
    assert calls == []
    result = publish_issues(tmp_path, confirm=True)
    assert result["sent_count"] == 1
    repeated = publish_issues(tmp_path, confirm=True)
    assert repeated["sent_count"] == 0 and repeated["issues"][0]["status"] == "already_published"
    assert len(calls) == 1


def test_modified_report_and_artifact_fail_closed_before_publishing(tmp_path, monkeypatch):
    report = publication_report(tmp_path)

    def forbidden(*args, **kwargs):
        pytest.fail("Modified report reached GitHub")

    monkeypatch.setattr("app.release_lab.publishing.subprocess.run", forbidden)
    report.gates[0].reason = "modified"
    (tmp_path / "report.json").write_text(report.model_dump_json(), encoding="utf-8")
    with pytest.raises(ValueError, match="changed after creation"):
        publish_issues(tmp_path, confirm=True)
    second = tmp_path / "artifact-case"
    second.mkdir()
    clean = publication_report(second)
    (second / clean.artifacts[0].path).write_bytes(FAIL.replace(b"broken", b"forged"))
    with pytest.raises(ValueError, match="hash mismatch"):
        publish_issues(second, confirm=True)


@pytest.mark.parametrize("failure", ["nonzero", "timeout", "missing", "wrong-url"])
def test_failed_publication_does_not_expose_stderr_or_retry_ambiguous_issue(tmp_path, monkeypatch, failure):
    publication_report(tmp_path)
    calls = []

    def fail_gh(command, **kwargs):
        calls.append(command)
        if failure == "timeout":
            raise subprocess.TimeoutExpired(command, 60, stderr="PRIVATE_STDERR_MUST_NOT_LEAVE")
        if failure == "missing":
            raise OSError("PRIVATE_STDERR_MUST_NOT_LEAVE")
        return subprocess.CompletedProcess(command, 1 if failure == "nonzero" else 0,
                                           "https://github.com/other/repo/issues/1", "PRIVATE_STDERR_MUST_NOT_LEAVE")

    monkeypatch.setattr("app.release_lab.publishing.subprocess.run", fail_gh)
    with pytest.raises(RuntimeError) as failed:
        publish_issues(tmp_path, confirm=True)
    assert "PRIVATE_" not in str(failed.value)
    with pytest.raises(RuntimeError, match="manual GitHub review"):
        publish_issues(tmp_path, confirm=True)
    assert len(calls) == 1


def test_green_report_never_sends_an_issue(tmp_path, monkeypatch):
    publication_report(tmp_path, PASS, code=0)
    monkeypatch.setattr("app.release_lab.publishing.subprocess.run", lambda *_args, **_kwargs: pytest.fail("Green report published an issue"))
    assert publish_issues(tmp_path, confirm=True)["sent_count"] == 0
