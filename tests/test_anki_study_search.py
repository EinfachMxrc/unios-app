# SPDX-License-Identifier: AGPL-3.0-or-later

"""The existing native search reaches cards beyond the bounded browser window."""

from fastapi.testclient import TestClient

from app.anki.collection import ensure_notetype, open_collection, write_study_mode
from app.main import create_app


def test_browser_searches_full_collection_before_limiting_results(settings, coordinator):
    deck_name = 'Uni::Synthetic_* "Quoted" \\Tail'
    with open_collection(settings) as col:
        ordinary_deck = col.decks.id("Uni::Ordinary Synthetic")
        target_deck = col.decks.id(deck_name)
        model = ensure_notetype(col, "basic")
        for index in range(200):
            note = col.new_note(model)
            note["Front"] = f"Ordinary synthetic question {index}"
            note["Back"] = "Synthetic answer"
            col.add_note(note, ordinary_deck)
        note = col.new_note(model)
        note["Front"] = "BeyondWindowUnique201"
        note["Back"] = "Synthetic target answer"
        col.add_note(note, target_deck)
        target_id = int(note.cards()[0].id)
        outside = col.new_note(model)
        outside["Front"] = "OutsideScopeUnique"
        outside["Back"] = "Synthetic outside answer"
        col.add_note(outside, ordinary_deck)
    write_study_mode(settings, "integrated")
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        first_window = client.get("/api/anki/study/cards")
        assert first_window.status_code == 200, first_window.text
        assert len(first_window.json()["cards"]) == 200
        assert target_id not in {card["id"] for card in first_window.json()["cards"]}

        found = client.get("/api/anki/study/cards", params={"q": "BeyondWindowUnique201"})
        assert found.status_code == 200, found.text
        assert [card["id"] for card in found.json()["cards"]] == [target_id]

        # The UI escapes the exact chosen deck name and groups OR expressions.
        escaped = deck_name.replace("\\", "\\\\").replace('"', '\\"').replace("*", "\\*").replace("_", "\\_")
        scoped = client.get("/api/anki/study/cards", params={
            "q": f'deck:"{escaped}" (BeyondWindowUnique201 or OutsideScopeUnique)',
        })
        assert scoped.status_code == 200, scoped.text
        assert [card["id"] for card in scoped.json()["cards"]] == [target_id]

        invalid = client.get("/api/anki/study/cards", params={"q": "("})
        assert invalid.status_code == 422
        assert invalid.json()["detail"] == "Ungültige Anki-Suche"
