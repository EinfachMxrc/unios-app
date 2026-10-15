# SPDX-License-Identifier: AGPL-3.0-or-later

"""New §25 CLI commands: search, deadlines, anki queue, cards, ai export, describe, setup."""

import json
from datetime import UTC, datetime, timedelta

from typer.testing import CliRunner

from app.anki.api import enqueue_cards
from app.cli.main import cli
from app.db.models import (
    AiAccess,
    AnkiCardQueue,
    Announcement,
    Course,
    Deadline,
    Resource,
    ResourceText,
    ResourceVersion,
)


def _course(session, name="Programmieren 1", short_name="Prog 1"):
    course = Course(source="fixture", source_id=name, name=name, short_name=short_name)
    session.add(course)
    session.flush()
    return course


def _resource_with_text(session, course, text="Ein Testinhalt für das Materialarchiv."):
    resource = Resource(source="fixture", source_key=f"r-{course.id}", course_id=course.id,
                        kind="file", name="Material.pdf", url="https://example.invalid/file")
    session.add(resource)
    session.flush()
    version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                              relative_path=f"uni/material-{resource.id}.pdf", size=10,
                              mime_type="application/pdf", downloaded_at=datetime.now(UTC))
    session.add(version)
    session.flush()
    session.add(ResourceText(version_id=version.id, page_number=1, text=text, markdown=text))
    session.commit()
    return resource, version


def test_search_filters_by_type_and_reports_invalid_type(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    with factory() as session:
        course = _course(session)
        session.add(Announcement(source="fixture", source_key="a1", course_id=course.id,
                                 title="Klausurtermin bekanntgegeben", body="Details folgen",
                                 created_at=datetime.now(UTC)))
        session.commit()
        course_id = course.id

    runner = CliRunner()
    hit = runner.invoke(cli, ["search", "Klausurtermin", "--type", "announcements", "--course", str(course_id)])
    assert hit.exit_code == 0, hit.output
    value = json.loads(hit.stdout)
    assert list(value.keys()) == ["announcement_results"]
    assert value["announcement_results"][0]["title"] == "Klausurtermin bekanntgegeben"

    empty = runner.invoke(cli, ["search", "   ", "--type", "all"])
    assert empty.exit_code == 0, empty.output
    shape = json.loads(empty.stdout)
    for key in ("results", "announcement_results", "annotation_results", "course_note_results",
               "note_results", "jot_results", "clip_results"):
        assert shape[key] == []
    assert {"courses", "semesters"} <= shape.keys()

    invalid = runner.invoke(cli, ["search", "x", "--type", "bogus"])
    assert invalid.exit_code == 2
    assert "type" in invalid.output

    too_long = runner.invoke(cli, ["search", "x" * 121])
    assert too_long.exit_code == 2


def test_deadlines_filters_by_window(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    now = datetime.now(UTC)
    with factory() as session:
        session.add(Deadline(source="fixture", source_key="soon", title="Bald fällig",
                             due_at=now + timedelta(days=3)))
        session.add(Deadline(source="fixture", source_key="far", title="Weit weg",
                             due_at=now + timedelta(days=30)))
        session.add(Deadline(source="fixture", source_key="removed", title="Entfernt",
                             due_at=now + timedelta(days=1), removed_upstream=True))
        session.commit()

    runner = CliRunner()
    default_window = runner.invoke(cli, ["deadlines"])
    assert default_window.exit_code == 0, default_window.output
    titles = {item["title"] for item in json.loads(default_window.stdout)}
    assert titles == {"Bald fällig"}

    wide_window = runner.invoke(cli, ["deadlines", "--days", "40"])
    assert wide_window.exit_code == 0, wide_window.output
    titles = {item["title"] for item in json.loads(wide_window.stdout)}
    assert titles == {"Bald fällig", "Weit weg"}

    invalid = runner.invoke(cli, ["deadlines", "--days", "0"])
    assert invalid.exit_code == 2


def test_anki_queue_lists_and_filters_by_status(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    with factory() as session:
        course = _course(session)
        resource, version = _resource_with_text(session, course)
        payload_source = {"resource_id": resource.id, "version": version.version}
        from app.anki.api import CardImport

        payload = CardImport.model_validate({
            "schema_version": 1, "generated_by": "test", "generated_at": datetime.now(UTC).isoformat(),
            "source": payload_source, "cards": [{
                "card_type": "basic", "front": "Frage?", "back": "Antwort.",
                "course": "egal", "topic": "thema", "confidence": "high"}],
        })
        enqueue_cards(session, settings, payload)
        session.commit()

    runner = CliRunner()
    listed = runner.invoke(cli, ["anki", "queue"])
    assert listed.exit_code == 0, listed.output
    items = json.loads(listed.stdout)
    assert len(items) == 1
    assert items[0]["status"] == "proposed"

    filtered = runner.invoke(cli, ["anki", "queue", "--status", "approved"])
    assert filtered.exit_code == 0, filtered.output
    assert json.loads(filtered.stdout) == []

    invalid = runner.invoke(cli, ["anki", "queue", "--status", "bogus"])
    assert invalid.exit_code == 2


def test_cards_import_lands_as_proposed_and_respects_lease(monkeypatch, tmp_path, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    with factory() as session:
        course = _course(session)
        resource, version = _resource_with_text(session, course)
        resource_id, version_number = resource.id, version.version

    card_file = tmp_path / "cards.json"
    card_file.write_text(json.dumps({
        "schema_version": 1, "generated_by": "test", "generated_at": datetime.now(UTC).isoformat(),
        "source": {"resource_id": resource_id, "version": version_number},
        "cards": [{"card_type": "basic", "front": "Frage?", "back": "Antwort.",
                   "course": "egal", "topic": "thema", "confidence": "high"}],
    }), encoding="utf-8")

    runner = CliRunner()
    busy = runner.invoke(cli, ["cards", "import", str(card_file)])
    assert busy.exit_code == 3, busy.output

    coordinator.close()
    imported = runner.invoke(cli, ["cards", "import", str(card_file)])
    assert imported.exit_code == 0, imported.output
    items = json.loads(imported.stdout)
    assert items[0]["status"] == "proposed"

    invalid_file = tmp_path / "invalid.json"
    invalid_file.write_text("{not json", encoding="utf-8")
    invalid = runner.invoke(cli, ["cards", "import", str(invalid_file)])
    assert invalid.exit_code == 2


def test_cards_export_writes_only_approved_cards(monkeypatch, tmp_path, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    with factory() as session:
        course = _course(session)
        resource, _version = _resource_with_text(session, course)
        proposed_payload = json.dumps({"card_type": "basic", "front": "F1", "back": "B1",
                                       "course": "c", "topic": "t", "confidence": "high"})
        approved_payload = json.dumps({"card_type": "basic", "front": "F2", "back": "B2",
                                       "course": "c", "topic": "t", "confidence": "high"})
        session.add(AnkiCardQueue(resource_id=resource.id, status="proposed", payload=proposed_payload))
        session.add(AnkiCardQueue(resource_id=resource.id, status="approved", payload=approved_payload))
        session.commit()

    output = tmp_path / "approved.json"
    runner = CliRunner()
    result = runner.invoke(cli, ["cards", "export", "--output", str(output)])
    assert result.exit_code == 0, result.output
    exported = json.loads(output.read_text(encoding="utf-8"))
    assert len(exported) == 1
    assert exported[0]["card"]["front"] == "F2"


def test_ai_export_respects_allow_list_lease_and_overwrite(monkeypatch, tmp_path, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    with factory() as session:
        course = _course(session)
        _resource_with_text(session, course)
        course_id = course.id

    output = tmp_path / "package.zip"
    runner = CliRunner()

    busy = runner.invoke(cli, ["ai", "export", "--course", str(course_id), "--output", str(output)])
    assert busy.exit_code == 3, busy.output

    coordinator.close()
    created = runner.invoke(cli, ["ai", "export", "--course", str(course_id), "--output", str(output)])
    assert created.exit_code == 0, created.output
    assert output.exists()

    overwrite = runner.invoke(cli, ["ai", "export", "--course", str(course_id), "--output", str(output)])
    assert overwrite.exit_code == 2
    assert "existiert" in overwrite.output

    with factory() as session:
        session.add(AiAccess(key=f"course:{course_id}", allowed=False))
        session.commit()
    locked_output = tmp_path / "locked.zip"
    locked = runner.invoke(cli, ["ai", "export", "--course", str(course_id), "--output", str(locked_output)])
    assert locked.exit_code == 2
    assert "gesperrt" in locked.output
    assert not locked_output.exists()

    invalid_mode = runner.invoke(cli, ["ai", "export", "--course", str(course_id),
                                       "--output", str(tmp_path / "x.zip"), "--mode", "bogus"])
    assert invalid_mode.exit_code == 2


def test_describe_reports_existing_and_missing_commands():
    runner = CliRunner()
    existing = runner.invoke(cli, ["describe", "status"])
    assert existing.exit_code == 0, existing.output
    value = json.loads(existing.stdout)
    assert value["name"] == "status"
    assert isinstance(value["parameters"], list)
    assert any(param["name"] == "pretty" for param in value["parameters"])

    nested = runner.invoke(cli, ["describe", "host", "status"])
    assert nested.exit_code == 0, nested.output
    assert json.loads(nested.stdout)["name"] == "host status"

    missing = runner.invoke(cli, ["describe", "does-not-exist"])
    assert missing.exit_code == 2
    assert "error" in json.loads(missing.output)


def test_setup_reports_next_steps_and_confirmation(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    runner = CliRunner()
    result = runner.invoke(cli, ["setup"])
    assert result.exit_code == 0, result.output
    value = json.loads(result.stdout)
    assert "checks" in value and "next_steps" in value
    assert value["confirmed"] is False or not value["next_steps"]

    confirmed = runner.invoke(cli, ["setup", "--yes"])
    assert confirmed.exit_code == 0, confirmed.output
    assert json.loads(confirmed.stdout)["confirmed"] is True
