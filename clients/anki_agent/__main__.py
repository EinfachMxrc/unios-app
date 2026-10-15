# SPDX-License-Identifier: AGPL-3.0-or-later

"""Push approved proposals into the local Anki Desktop collection."""

import argparse
import html
import os
import re
import sys
from datetime import UTC, datetime

import httpx

from app.anki.card_schema import manual_note_marker, plain_card_html

BASIC_FIELDS = ["Front", "Back", "Course", "Topic", "Semester", "SourceFile", "SourcePage", "CreatedAt", "UniOSId"]
CLOZE_FIELDS = ["Text", "Extra", "Course", "Topic", "Semester", "SourceFile", "SourcePage", "CreatedAt", "UniOSId"]


def slug(value: str) -> str:
    value = value.casefold().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or "unbekannt"


def safe_text(value: str) -> str:
    return html.escape(value).replace("\n", "<br>")


class AnkiConnect:
    def __init__(self, url: str):
        self.client = httpx.Client(base_url=url, timeout=8)

    def call(self, action: str, **params):
        response = self.client.post("", json={"action": action, "version": 6, "params": params})
        response.raise_for_status()
        payload = response.json()
        if payload.get("error") is not None:
            raise RuntimeError(f"AnkiConnect {action}: {payload['error']}")
        return payload["result"]

    def ensure_model(self, kind: str) -> str:
        name = "UniOS Cloze" if kind == "cloze" else "UniOS Basic"
        if name in self.call("modelNames"):
            return name
        if kind == "cloze":
            self.call("createModel", modelName=name, inOrderFields=CLOZE_FIELDS, isCloze=True,
                      cardTemplates=[{"Name": "Karte", "Front": "{{cloze:Text}}",
                                      "Back": "{{cloze:Text}}<br>{{Extra}}"}])
        else:
            self.call("createModel", modelName=name, inOrderFields=BASIC_FIELDS,
                      cardTemplates=[{"Name": "Karte", "Front": "{{Front}}",
                                      "Back": "{{FrontSide}}<hr id=answer>{{Back}}"}])
        return name


def build_note(item: dict, model_name: str) -> dict:
    card = item["card"]
    kind = card["card_type"]
    manual = item.get("origin", "ai") == "manual"
    if manual and kind != "basic":
        raise ValueError("Eigene Karten benötigen Basic-Inhalt")
    marker = manual_note_marker(str(item.get("guid"))) if manual else str(item["id"])
    render = plain_card_html if manual else safe_text
    common = {
        "Course": render(item["course_name"]),
        "Topic": render(card["topic"]),
        "Semester": render(item["semester_name"]),
        "SourceFile": render(item["resource_name"]),
        "SourcePage": str(card.get("source_page") or ""),
        "CreatedAt": datetime.now(UTC).isoformat(),
        "UniOSId": marker,
    }
    if kind == "cloze":
        if not re.search(r"\{\{c\d+::.+?\}\}", card["front"], re.DOTALL):
            raise ValueError("Lückentext benötigt eine {{c1::...}}-Markierung")
        fields = {"Text": render(card["front"]), "Extra": render(card["back"]), **common}
    else:
        fields = {"Front": render(card["front"]), "Back": render(card["back"]), **common}
    return {
        "deckName": f"Uni::{item['course_name']}",
        "modelName": model_name,
        "fields": fields,
        "tags": [f"uni::{slug(card['course'])}::{slug(card['topic'])}",
                 f"semester::{slug(item['semester_name'])}", marker if manual else f"unios-id-{item['id']}"],
        "options": {"allowDuplicate": manual, "duplicateScope": "deck"},
    }


def sync(host_url: str, agent_token: str, anki_url: str) -> int:
    anki = AnkiConnect(anki_url)
    with anki.client, httpx.Client(base_url=host_url, timeout=10,
                                  headers={"X-Anki-Agent-Token": agent_token,
                                           "X-UniOS-Anki-Capabilities": "manual-guid-v1"}) as host:
        if anki.call("version") < 6:
            raise RuntimeError("AnkiConnect API-Version 6 benötigt")
        response = host.get("/api/anki/agent/approved")
        response.raise_for_status()
        items = response.json()
        for item in items:
            manual = item.get("origin", "ai") == "manual"
            if manual:
                marker = manual_note_marker(str(item.get("guid")))
                candidates = anki.call("findNotes", query=f'"UniOSId:{marker}"')
                notes = anki.call("notesInfo", notes=candidates) if candidates else []
                existing = [note["noteId"] for note in notes
                            if note.get("fields", {}).get("UniOSId", {}).get("value") == marker]
            else:
                existing = anki.call("findNotes", query=f"tag:unios-id-{item['id']}")
            if len(existing) > 1:
                raise RuntimeError(f"Mehrere Anki-Notizen für Vorschlag {item['id']}; manuell prüfen")
            if existing:
                note_id = existing[0]
            else:
                model_name = anki.ensure_model(item["card"]["card_type"])
                note = build_note(item, model_name)
                anki.call("createDeck", deck=note["deckName"])
                note_id = anki.call("addNote", note=note)
                if not note_id:
                    raise RuntimeError(f"Anki hat Vorschlag {item['id']} nicht übernommen")
            ack = {"queue_id": item["id"], "note_id": note_id}
            if manual:
                ack["guid"] = str(item["guid"])
            acknowledged = host.post("/api/anki/agent/pushed", json=ack)
            acknowledged.raise_for_status()
        notes_response = host.get("/api/anki/agent/notes")
        notes_response.raise_for_status()
        for entry in notes_response.json():
            note_id = entry["note_id"]
            card_ids = anki.call("findCards", query=f"nid:{note_id}")
            if not card_ids:
                continue
            card_info = anki.call("cardsInfo", cards=card_ids)
            verified_cards = [card["cardId"] for card in card_info if card["note"] == note_id]
            if not verified_cards:
                continue
            review_map = anki.call("getReviewsOfCards", cards=verified_cards)
            reviews = [{"note_id": note_id, "review_id": review["id"], "rating": review["ease"]}
                       for history in review_map.values() for review in history if 1 <= review["ease"] <= 4]
            for offset in range(0, len(reviews), 1000):
                imported = host.post("/api/anki/agent/reviews",
                                     json={"reviews": reviews[offset:offset + 1000]})
                imported.raise_for_status()
    return len(items)


def main() -> int:
    parser = argparse.ArgumentParser(description="Freigegebene UniOS-Karten nach Anki übertragen")
    parser.add_argument("--host", default=os.environ.get("UNIOS_HOST_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--anki", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    token = os.environ.get("ANKI_AGENT_TOKEN", "")
    if not token:
        parser.error("ANKI_AGENT_TOKEN fehlt")
    if not args.anki.startswith("http://127.0.0.1:"):
        parser.error("AnkiConnect muss lokal auf 127.0.0.1 laufen")
    try:
        count = sync(args.host, token, args.anki)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as exc:
        print(f"Anki-Übertragung fehlgeschlagen: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(f"{count} freigegebene Kartenvorschläge verarbeitet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
