# SPDX-License-Identifier: AGPL-3.0-or-later

"""Block documents: Markdown edges, validation, stable ids and the document API."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.notes.document import (
    Document,
    DocumentError,
    link_first_mention,
    to_data,
    to_text,
    validate,
)
from app.notes.markdown import parse_markdown, render_markdown
from app.notes.store import (
    NoteError,
    create_note,
    read_note,
    read_note_document,
    update_note,
)
from tests.test_notes import prepare

SAMPLE = '''# Titel

Absatz mit **fett**, *kursiv*, `code`, [[Andere Notiz]] und [Link](https://example.org).
Zweite Zeile.

- eins
  - verschachtelt
- [x] erledigt
1. a
2. b

> Zitat
> mehr

```python
print("hi")
```

:::callout {kind="definition" label="Basisfall"}

**Der Basisfall** beendet.

:::

:::entity {kind="course" id="1" label="Prog"} :::

| a | b |
| --- | --- |
| 1 | 2 |

$$
x^2
$$

---'''


def test_markdown_roundtrips_through_blocks_with_stable_types():
    document = parse_markdown(SAMPLE, seed="fixture")
    assert [block.type for block in document.blocks] == [
        "heading", "paragraph", "bullet", "todo", "numbered", "numbered", "quote", "code",
        "callout", "entity", "table", "equation", "divider"]
    assert document.blocks[2].children[0].content[0].text == "verschachtelt"
    assert render_markdown(document) == SAMPLE
    assert parse_markdown(render_markdown(document), seed="fixture") == document


def test_inline_escapes_survive_a_roundtrip():
    document = parse_markdown(r"Preis \* 3 und \[[kein Link\]] sowie a\_b", seed="fixture")
    assert to_text(document) == "Preis * 3 und [[kein Link]] sowie a_b"
    assert document.blocks[0].content[0].type == "text"
    assert parse_markdown(render_markdown(document), seed="fixture") == document


def test_legacy_conversion_is_deterministic_and_ids_survive_edits():
    first = parse_markdown(SAMPLE, seed="abc")
    assert first == parse_markdown(SAMPLE, seed="abc")
    edited = parse_markdown(SAMPLE.replace("Zweite Zeile.", "Dritte Zeile."), previous=first)
    ids = [block.id for block in first.blocks]
    assert [block.id for block in edited.blocks] == ids  # edited paragraph keeps its identity


@pytest.mark.parametrize("raw", [
    {"version": 1, "blocks": [{"id": "abc", "type": "paragraph"}]},
    {"version": 1, "blocks": [{"id": "abcdef", "type": "script"}]},
    {"version": 1, "blocks": [{"id": "abcdef", "type": "heading", "props": {"level": 9}}]},
    {"version": 1, "blocks": [{"id": "abcdef", "type": "divider", "children": [{"id": "ghijkl", "type": "paragraph"}]}]},
    {"version": 1, "blocks": [{"id": "abcdef", "type": "paragraph"}, {"id": "abcdef", "type": "paragraph"}]},
    {"version": 1, "blocks": [{"id": "abcdef", "type": "media", "props": {"kind": "image", "src": "javascript:x"}}]},
    {"version": 1, "blocks": [{"id": "abcdef", "type": "paragraph",
                              "content": [{"type": "text", "text": "x", "href": "javascript:alert(1)"}]}]},
])
def test_invalid_documents_are_rejected(raw):
    with pytest.raises(DocumentError):
        validate(raw)


def test_document_save_is_canonical_noop_safe_and_searchable(settings, factory):
    course_id, _ = prepare(factory)
    document = to_data(parse_markdown("# Rekursion\n\nEine Funktion ruft sich selbst auf.", seed="fixture"))
    with factory() as session:
        note = create_note(session, settings, course_id=course_id, resource_id=None, title="Block", document=document)
        note_id = note.id
        assert update_note(session, settings, note_id, expected_revision=1, title="Block",
                           document=document).current_revision == 1
        # The Markdown view of the same content is also a no-op, so CLI round-trips never fork history.
        _, _, markdown, _ = read_note(session, settings, note_id)
        assert update_note(session, settings, note_id, expected_revision=1, title="Block",
                           body=markdown).current_revision == 1
        document["blocks"][1]["content"][0]["marks"] = ["underline"]
        update_note(session, settings, note_id, expected_revision=1, title="Block", document=document)
        _, _, stored, versions = read_note_document(session, settings, note_id)
        assert [item.revision for item in versions] == [2, 1]
        assert stored.blocks[1].content[0].marks == ["underline"]
        with pytest.raises(NoteError):
            update_note(session, settings, note_id, expected_revision=2, title="Block",
                        document={"version": 1, "blocks": [{"id": "x", "type": "paragraph"}]})


def test_mention_is_linked_without_touching_code_or_other_formatting():
    document = parse_markdown("Rekursion in `Rekursion` und **Rekursion fett**.", seed="fixture")
    assert link_first_mention(document, "Rekursion")
    assert to_text(document).startswith("[[Rekursion]] in `Rekursion` und Rekursion fett")
    assert document.blocks[0].content[0].type == "wikilink"
    assert "`Rekursion`" in to_text(document)
    assert not link_first_mention(parse_markdown("```\nRekursion\n```", seed="fixture"), "Rekursion")


def test_api_saves_and_returns_documents_and_markdown_view(settings, factory, coordinator):
    course_id, _ = prepare(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    document = to_data(Document(blocks=parse_markdown("# Neu\n\nText", seed="fixture").blocks))
    with TestClient(app) as client:
        created = client.post("/api/notes", json={"course_id": course_id, "title": "Doc", "document": document})
        assert created.status_code == 201
        detail = created.json()
        assert detail["document"]["blocks"][0]["props"]["level"] == 1
        assert detail["body"] == "# Neu\n\nText"
        assert client.post("/api/notes", json={"course_id": course_id, "title": "Leer"}).status_code == 422
        bad = client.put(f"/api/notes/{detail['note']['id']}", json={
            "expected_revision": 1, "title": "Doc",
            "document": {"version": 1, "blocks": [{"id": "abcdef", "type": "script"}]}})
        assert bad.status_code in {400, 422}


def test_legacy_constructs_become_typed_blocks_and_round_trip():
    body = ('Satz mit ==Markierung== und =={green}Grün== sowie $x^2$ und 5 \\$ Preis.\n\n'
            ':::fold {label="Beweis"}\n\nSchritt eins\n\n:::\n\n'
            '```unios-recall\n{"source": "{\\"question\\":\\"?\\"}"}\n```\n\n'
            '$$a+b$$\n\n:::mystery {x="1"}\n\nbleibt Text\n\n:::')
    document = parse_markdown(body, seed="fixture")
    kinds = [block.type for block in document.blocks]
    assert kinds == ["paragraph", "toggle", "study", "equation", "paragraph"]
    inline = document.blocks[0].content
    assert [(item.type, item.color) for item in inline if "highlight" in item.marks] == [("text", "yellow"), ("text", "green")]
    assert any(item.type == "math" and item.latex == "x^2" for item in inline)
    assert document.blocks[1].children[0].content[0].text == "Schritt eins"
    assert document.blocks[2].props["kind"] == "recall"
    assert ":::mystery" in to_text(document)
    assert parse_markdown(render_markdown(document), seed="fixture") == document
