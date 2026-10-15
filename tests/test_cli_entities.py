# SPDX-License-Identifier: AGPL-3.0-or-later

"""Universal CLI previews never write and confirmed mutations use the API client."""

import json

from typer.testing import CliRunner

from app.cli.main import cli


def test_schema_and_entity_description_are_json():
    runner = CliRunner()
    schema = runner.invoke(cli, ["schema", "--json"])
    assert schema.exit_code == 0, schema.output
    assert {item["kind"] for item in json.loads(schema.stdout)["entities"]} >= {"course", "note"}
    description = runner.invoke(cli, ["describe", "note", "--json"])
    assert description.exit_code == 0, description.output
    assert json.loads(description.stdout)["id_type"] == "uuid"


def test_relate_requires_yes_and_preview_reads_only(monkeypatch):
    calls = []

    def fake_call(method, path, **kwargs):
        calls.append((method, path, kwargs))
        return {"id": 1, "name": "Demo"}

    monkeypatch.setattr("app.cli.entities.call_api", fake_call)
    runner = CliRunner()
    args = ["relate", "course", "1", "explains", "note", "abc"]
    assert runner.invoke(cli, args).exit_code == 2
    preview = runner.invoke(cli, [*args, "--dry-run", "--json"])
    assert preview.exit_code == 0, preview.output
    assert [call[0] for call in calls] == ["GET", "GET"]
    calls.clear()
    created = runner.invoke(cli, [*args, "--yes", "--json"])
    assert created.exit_code == 0, created.output
    assert calls[0][0] == "POST"
    assert calls[0][2]["confirmed"] is True


def test_entity_search_and_links_use_approved_paths(monkeypatch):
    calls = []

    def fake_call(method, path, **kwargs):
        calls.append(path)
        return []

    monkeypatch.setattr("app.cli.entities.call_api", fake_call)
    runner = CliRunner()
    assert runner.invoke(cli, ["entity", "search", "note", "Binärbäume", "--json"]).exit_code == 0
    assert runner.invoke(cli, ["entity", "links", "note", "abc", "--json"]).exit_code == 0
    assert calls == ["/api/entities/note?q=Bin%C3%A4rb%C3%A4ume", "/api/links/note/abc"]
