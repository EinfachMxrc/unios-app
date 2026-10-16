# SPDX-License-Identifier: AGPL-3.0-or-later

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.notes.blocks import BlockEdit, edit_document, list_blocks
from app.notes.markdown import parse_markdown, render_markdown
from app.notes.store import create_note
from tests.test_notes import prepare


def _doc(body: str):
    return parse_markdown(body, seed="fixture")


def test_blocks_keep_fenced_blank_lines_tables_and_nested_callouts():
    body = '# Start\n\n```python\nprint("a")\n\nprint("b")\n```\n\n:::callout {kind="note"}\n\nText\n\n:::callout {kind="question"}\n\nFrage?\n\n:::\n\n:::\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
    document = _doc(body)
    blocks = list_blocks(document)
    assert [block["type"] for block in blocks] == ["heading1", "code", "callout", "table"]
    assert all(block["id"] for block in blocks)
    result = edit_document(document, BlockEdit(expected_revision=1, operation="replace", index=0, markdown="# Neuer Titel"))
    assert result.blocks[0].id == document.blocks[0].id
    assert render_markdown(result).replace("# Neuer Titel", "# Start", 1) == body
    assert 'print("a")\n\nprint("b")' in blocks[1]["markdown"]
    assert len(document.blocks[2].children) == 2 and document.blocks[2].children[1].type == "callout"


def test_moves_and_inserts_preserve_each_block_and_reject_invalid_or_empty_edits():
    document = _doc('# A\n\nAbsatz eins\n\n# B\n\nAbsatz zwei')
    moved = edit_document(document, BlockEdit(expected_revision=1, operation="move", index=0, destination=3))
    assert [block["markdown"].strip() for block in list_blocks(moved)] == ['Absatz eins', '# B', 'Absatz zwei', '# A']
    inserted = edit_document(document, BlockEdit(expected_revision=1, operation="insert", index=4, markdown="## Ende"))
    assert list_blocks(inserted)[-1]["markdown"].strip() == "## Ende"
    with pytest.raises(ValueError):
        edit_document(document, BlockEdit(expected_revision=1, operation="delete", index=9))
    with pytest.raises(ValueError):
        edit_document(_doc("Text"), BlockEdit(expected_revision=1, operation="delete", index=0))
    with pytest.raises(ValidationError):
        BlockEdit(expected_revision=1, operation="move", index=0, markdown="unexpected")


def test_note_actions_confirm_revision_and_keep_original_version(settings, factory, coordinator):
    course_id, _ = prepare(factory)
    with factory() as session:
        note_id = create_note(session, settings, course_id=course_id, resource_id=None,
                              title="Erfundene Notiz", body="# Grundlagen\n\nUnverändert").id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        path = f"/api/entities/note/{note_id}/actions/"
        result = client.get(path + "note.blocks")
        assert result.status_code == 200 and len(result.json()["result"]["blocks"]) == 2
        data = {"input": {"expected_revision": 1, "operation": "replace", "index": 0, "markdown": "# Neu"}}
        assert client.post(path + "note.edit_block", json=data).status_code == 409
        assert client.post(path + "note.edit_block", json={**data, "dry_run": True}).json()["dry_run"]
        assert client.post(path + "note.edit_block", json={**data, "confirmed": True}).json()["result"]["revision"] == 2
        assert client.post(path + "note.edit_block", json={**data, "confirmed": True}).status_code == 409
        assert client.get(f"/api/notes/{note_id}?revision=1").json()["body"] == "# Grundlagen\n\nUnverändert"
        assert client.get(f"/api/notes/{note_id}").json()["body"] == "# Neu\n\nUnverändert"
