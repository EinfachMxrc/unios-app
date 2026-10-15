# SPDX-License-Identifier: AGPL-3.0-or-later

"""A losing host keeps a complete private recovery package and stops writing."""

import json
import sqlite3
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db.models import SyncRun, utc_now
from app.files.localpath import strip_extended_prefix
from app.host import snapshots as snapshot_module
from app.host.actions import ActionJournal
from app.host.conflicts import (
    build_conflict_package,
    conflict_actions,
    conflict_summaries,
    lease_wins,
    mark_conflict_action_checked,
    mark_conflict_action_replayed,
    mark_conflict_package_reviewed,
)
from app.host.lease import HostCoordinator, HostLeaseError, LeaseRecord, _atomic_json
from app.host.snapshots import create_snapshot
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler


def test_action_journal_long_paths_keep_atomic_head_and_verified_recovery(settings, coordinator):
    directory = settings.local_dir
    while len(str(directory)) < 270:
        directory /= 'p' * min(120, 270 - len(str(directory)))
    long_settings = settings.model_copy(update={'local_dir': directory})
    journal = ActionJournal(long_settings)
    action_id = journal.begin_operation(coordinator, 'rebuild-index')
    journal.finish(action_id, 200)
    assert len(strip_extended_prefix(str(journal.path))) > 259
    assert journal.path.is_file() and journal.head_path.is_file()
    assert list(journal.path.parent.glob('*.tmp')) == []
    size, digest, trusted = journal.snapshot_anchor()
    assert size == journal.path.stat().st_size
    assert len(digest) == 64 and trusted
    actions, intact = journal.actions_since(None, coordinator.current().device_id)
    assert intact and len(actions) == 1
    assert actions[0]['id'] == action_id
    assert actions[0]['outcome'] == 'erfolgreich'


def test_losing_host_archives_dashboard_actions_and_database(settings, factory, coordinator):
    baseline = create_snapshot(coordinator)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.put("/api/ai/access/category/course_material", json={"allowed": False,
                                                                           "token": "SENTINEL-SECRET"})
        assert response.status_code == 200, response.text
    journal = settings.local_dir / "host-actions.jsonl"
    assert "SENTINEL-SECRET" not in journal.read_text(encoding="utf-8")

    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, 2,
                         base_snapshot=baseline.filename)
    _atomic_json(coordinator.lease_path, asdict(winner))
    with pytest.raises(HostLeaseError, match="Schreibzugriff gesperrt"):
        coordinator.assert_writer()
    assert coordinator.is_writer is False

    local_manifests = list((settings.local_dir / "conflicts").glob("*/manifest.json"))
    assert len(local_manifests) == 1
    local = local_manifests[0].parent
    manifest = json.loads(local_manifests[0].read_text(encoding="utf-8"))
    assert manifest["winner"]["generation"] == 2
    assert manifest["common_snapshot"] == baseline.filename
    assert manifest["dashboard_actions_complete"] is True
    assert manifest["action_count"] == 1
    actions = json.loads((local / "actions.json").read_text(encoding="utf-8"))
    assert actions[0]["path"] == "/api/ai/access/category/course_material"
    assert actions[0]["body"] == {"allowed": False, "token": "[geschützt]"}
    assert actions[0]["outcome"] == "erfolgreich"
    with sqlite3.connect(local / "database.sqlite3") as database:
        assert database.execute("SELECT allowed FROM ai_access WHERE key='category:course_material'").fetchone() == (0,)
    shared = settings.data_dir / "host" / "conflicts" / local.name
    assert (shared / "manifest.json").is_file()
    assert (shared / "database.sqlite3").is_file()
    assert (shared / "actions.json").read_bytes() == (local / "actions.json").read_bytes()
    with TestClient(app) as client:
        listing = client.get("/api/host/conflicts")
        assert listing.status_code == 200
        assert listing.headers["cache-control"] == "private, no-store"
        assert listing.json()[0]["action_count"] == 1
        detail = client.get(f"/api/host/conflicts/{local.name}")
        assert detail.status_code == 200
        assert detail.json()["actions"][0]["body"]["token"] == "[geschützt]"
        assert client.post(f"/api/host/conflicts/{local.name}/{actions[0]['id']}/replayed").status_code == 423
        assert client.post(f"/api/host/conflicts/{local.name}/reviewed").status_code == 423
        assert client.get("/api/host/conflicts/../../etc").status_code in {400, 404}

    winner_settings = Settings(_env_file=None, moodle_base_url="https://moodle.example.invalid",
                               moodle_token="fixture-token", data_dir=settings.data_dir,
                               local_dir=settings.local_dir.parent / "winner-local",
                               allowed_hosts="127.0.0.1,localhost,[::1],testserver", api_auth_required=False)
    writer = HostCoordinator(winner_settings)
    winner_settings.local_dir.mkdir(parents=True)
    _atomic_json(writer.identity_path, {"device_id": winner.device_id})
    assert writer.start(background=False)
    try:
        with TestClient(create_app(winner_settings, connectors=[], start_scheduler=False, coordinator=writer)) as client:
            route = f"/api/host/conflicts/{local.name}/{actions[0]['id']}/replayed"
            assert client.post(route).status_code == 204
            assert client.post(route).status_code == 204
            assert client.get(f"/api/host/conflicts/{local.name}").json()["actions"][0]["replayed"] is True
            review = f"/api/host/conflicts/{local.name}/reviewed"
            assert client.post(review).status_code == 204
            assert client.post(review).status_code == 204
            assert client.get("/api/host/conflicts").json()[0]["reviewed"] is True
            assert (shared / "reviewed.json").is_file()
    finally:
        writer.close()
    assert conflict_summaries(settings)[0]["reviewed"] is True
    assert conflict_actions(settings, local.name)[0]["replayed"] is True


def test_lease_winner_uses_generation_then_earliest_acquisition():
    now = datetime.now(UTC)
    early = LeaseRecord(str(uuid4()), "früh", now.isoformat(), now.isoformat(), 2)
    late_time = (now + timedelta(seconds=1)).isoformat()
    late = LeaseRecord(str(uuid4()), "spät", late_time, late_time, 2)
    higher = LeaseRecord(str(uuid4()), "neuer", late_time, late_time, 3)
    assert lease_wins(early, late)
    assert not lease_wins(late, early)
    assert lease_wins(higher, early)


def test_sync_and_uncertain_operations_are_kept_in_conflict_package(settings, factory, coordinator):
    baseline = create_snapshot(coordinator)
    result = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator).run()
    assert result is not None and result.status == "success"
    journal = ActionJournal(settings)
    uncertain = journal.begin_operation(coordinator, "rebuild-index")
    journal.finish(uncertain, 500)

    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    actions = conflict_actions(settings, package.package_id)
    assert actions is not None
    assert {(item["path"], item["outcome"]) for item in actions} == {
        ("/internal/sync", "erfolgreich"), ("/internal/rebuild-index", "unklar")}
    assert all(item["body"] is None for item in actions)


def test_package_review_requires_each_action_to_be_replayed_or_checked(settings, factory, coordinator):
    baseline = create_snapshot(coordinator)
    journal = ActionJournal(settings)
    replayed_id = journal.begin_operation(coordinator, "sync")
    journal.finish(replayed_id, 200)
    checked_id = journal.begin_operation(coordinator, "backup")
    journal.finish(checked_id, 500)
    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    assert not mark_conflict_package_reviewed(settings, package.package_id)
    assert mark_conflict_action_replayed(settings, package.package_id, replayed_id)
    assert not mark_conflict_package_reviewed(settings, package.package_id)
    assert mark_conflict_action_checked(settings, package.package_id, checked_id)
    assert mark_conflict_package_reviewed(settings, package.package_id)
    actions = conflict_actions(settings, package.package_id)
    assert actions is not None
    assert [(item["replayed"], item["checked"]) for item in actions] == [(True, False), (False, True)]


def test_mcp_read_audit_is_kept_in_conflict_package_without_token(settings, factory, coordinator):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    baseline = create_snapshot(coordinator)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get("/api/ai/mcp/courses", headers={"X-UniOS-MCP-Token": "fixture-mcp-token"})
        assert response.status_code == 200
    assert "fixture-mcp-token" not in (settings.local_dir / "host-actions.jsonl").read_text(encoding="utf-8")
    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    actions = conflict_actions(settings, package.package_id)
    assert actions is not None
    assert [(item["method"], item["path"], item["body"]) for item in actions] == [
        ("GET", "/api/ai/mcp/courses", None)]


def test_conflict_actions_use_journal_position_when_clock_moves_back(settings, factory, coordinator):
    journal = ActionJournal(settings)
    before = journal.begin_operation(coordinator, "rebuild-index")
    journal.finish(before, 200)
    baseline = create_snapshot(coordinator)
    owned = coordinator.current()
    assert owned is not None
    action_id = uuid4().hex
    old_time = (datetime.now(UTC) - timedelta(days=30)).isoformat()
    journal._append({"kind": "intent", "id": action_id, "recorded_at": old_time,
                     "device_id": owned.device_id, "generation": owned.generation,
                     "method": "SYSTEM", "path": "/internal/weekly-digest",
                     "body": None, "body_state": "ohne JSON"})
    journal._append({"kind": "result", "id": action_id, "status": 200, "recorded_at": old_time})

    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    actions = conflict_actions(settings, package.package_id)
    assert actions is not None
    assert [item["id"] for item in actions] == [action_id]
    manifest = json.loads((package.local_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["dashboard_actions_complete"] is True


def test_snapshot_keeps_action_committed_during_database_copy(settings, factory, coordinator, monkeypatch):
    journal = ActionJournal(settings)
    original_check = snapshot_module._sqlite_integrity_check
    action_ids = []

    def write_during_snapshot(path):
        checked = original_check(path)
        if not action_ids:
            action_id = journal.begin_operation(coordinator, "rebuild-index")
            journal.finish(action_id, 200)
            action_ids.append(action_id)
        return checked

    monkeypatch.setattr(snapshot_module, "_sqlite_integrity_check", write_during_snapshot)
    baseline = create_snapshot(coordinator)
    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    actions = conflict_actions(settings, package.package_id)
    assert actions is not None
    assert [item["id"] for item in actions] == action_ids


def test_winning_host_ignores_only_valid_losing_lease_copy(settings, factory, coordinator):
    owned = coordinator.current()
    assert owned is not None
    later = (datetime.fromisoformat(owned.acquired_at) + timedelta(seconds=1)).isoformat()
    losing = LeaseRecord(str(uuid4()), "Anderes Gerät", later, later, owned.generation)
    conflict = settings.data_dir / "host" / "lease.sync-conflict-20260925-073000-TEST.json"
    _atomic_json(conflict, asdict(losing))
    coordinator.assert_writer()
    assert coordinator.is_writer
    nested = settings.data_dir / "host" / "snapshots" / "unknown.sync-conflict-20260925-073000-TEST"
    nested.parent.mkdir(parents=True, exist_ok=True)
    nested.write_text("unknown", encoding="utf-8")
    with pytest.raises(HostLeaseError, match="Syncthing-Konflikt"):
        coordinator.assert_writer()


def test_winner_restores_lease_when_syncthing_chose_loser_as_canonical(settings, factory, coordinator):
    owned = coordinator.current()
    assert owned is not None
    later = (datetime.fromisoformat(owned.acquired_at) + timedelta(seconds=1)).isoformat()
    losing = LeaseRecord(str(uuid4()), "Anderes Gerät", later, later, owned.generation)
    conflict = settings.data_dir / "host" / "lease.sync-conflict-20260925-073000-TEST.json"
    _atomic_json(conflict, asdict(owned))
    _atomic_json(coordinator.lease_path, asdict(losing))

    coordinator.assert_writer()
    assert coordinator.is_writer
    assert coordinator.current().device_id == owned.device_id
    archived = list((settings.data_dir / "host" / "lease-resolutions").glob("*.json"))
    assert len(archived) == 1
    assert json.loads(archived[0].read_text(encoding="utf-8"))["device_id"] == losing.device_id


def test_winner_recovers_after_restart_only_with_its_valid_conflict_copy(settings, factory, coordinator):
    owned = coordinator.current()
    assert owned is not None
    coordinator.close()
    later = (datetime.fromisoformat(owned.acquired_at) + timedelta(seconds=1)).isoformat()
    losing = LeaseRecord(str(uuid4()), "Anderes Gerät", later, later, owned.generation)
    _atomic_json(settings.data_dir / "host" / "lease.sync-conflict-20260925-073000-TEST.json", asdict(owned))
    _atomic_json(coordinator.lease_path, asdict(losing))
    restarted = HostCoordinator(settings)
    try:
        assert restarted.start(background=False)
        assert restarted.is_writer
    finally:
        restarted.close()


def test_older_canonical_without_own_conflict_copy_does_not_get_replaced(settings, factory, coordinator):
    owned = coordinator.current()
    assert owned is not None
    later = (datetime.fromisoformat(owned.acquired_at) + timedelta(seconds=1)).isoformat()
    losing = LeaseRecord(str(uuid4()), "Anderes Gerät", later, later, owned.generation)
    _atomic_json(coordinator.lease_path, asdict(losing))
    with pytest.raises(HostLeaseError, match="Schreibzugriff gesperrt"):
        coordinator.assert_writer()
    assert coordinator.current() == losing
    assert not (settings.data_dir / "host" / "lease-resolutions").exists()


def test_package_retries_shared_publication_and_marks_corrupt_journal_incomplete(settings, factory, coordinator):
    baseline = create_snapshot(coordinator)
    with (settings.local_dir / "host-actions.jsonl").open("a", encoding="utf-8") as journal:
        journal.write("{broken line\n")
    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    assert package.shared_path is not None
    manifest = json.loads((package.local_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["dashboard_actions_complete"] is False
    # Simulate a publication interrupted after actions and database copy.
    (package.shared_path / "manifest.json").unlink()
    retried = build_conflict_package(settings, owned, winner)
    assert retried.package_id == package.package_id
    assert retried.shared_path == package.shared_path
    assert (retried.shared_path / "manifest.json").is_file()


@pytest.mark.parametrize("damage", ["missing", "truncated", "suffix", "head_missing"])
def test_conflict_package_detects_lost_action_journal_after_snapshot(settings, factory, coordinator, damage):
    journal = ActionJournal(settings)
    before = journal.begin_operation(coordinator, "rebuild-index")
    journal.finish(before, 200)
    baseline = create_snapshot(coordinator)
    assert baseline.action_journal_bytes and baseline.action_journal_sha256
    snapshot_prefix = journal.path.read_bytes()
    after = journal.begin_operation(coordinator, "rebuild-annotations")
    journal.finish(after, 200)
    if damage == "missing":
        journal.path.unlink()
    elif damage == "truncated":
        journal.path.write_bytes(b"")
    elif damage == "suffix":
        journal.path.write_bytes(snapshot_prefix)
    else:
        journal.head_path.unlink()
    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    manifest = json.loads((package.local_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["dashboard_actions_complete"] is False
    assert manifest["common_snapshot"] == baseline.filename


def test_result_without_intent_marks_action_journal_incomplete(settings, factory, coordinator):
    journal = ActionJournal(settings)
    journal.finish(uuid4().hex, 200)
    owned = coordinator.current()
    assert owned is not None
    assert journal.actions_since(None, owned.device_id) == ([], False)


def test_background_notifications_and_digest_appear_in_conflict_package(settings, factory, coordinator):
    with factory() as session:
        session.add(SyncRun(status="success", finished_at=utc_now() - timedelta(hours=25)))
        session.commit()
    baseline = create_snapshot(coordinator)
    notifier = Notifier(settings, coordinator)
    engine = SyncEngine(factory, settings, [], notifier, coordinator)
    scheduler = SyncScheduler(engine, settings, coordinator)
    scheduler._warn_stale_sync()
    scheduler._warn_deadlines()
    scheduler._send_digest()
    owned = coordinator.current()
    assert owned is not None
    now = datetime.now(UTC).isoformat()
    winner = LeaseRecord(str(uuid4()), "Test-PC", now, now, owned.generation + 1,
                         base_snapshot=baseline.filename)
    package = build_conflict_package(settings, owned, winner)
    actions = conflict_actions(settings, package.package_id)
    assert actions is not None
    assert {item["path"] for item in actions} == {
        "/internal/stale-sync-warning", "/internal/deadline-warnings", "/internal/weekly-digest",
    }
    assert all(item["outcome"] == "erfolgreich" for item in actions)
