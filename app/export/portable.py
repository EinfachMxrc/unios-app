# SPDX-License-Identifier: AGPL-3.0-or-later

"""Documented formats that remain useful without a running UniOS installation."""

import csv
import hashlib
import io
import json
import sqlite3
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path

from app.export.repository import portable_rows
from app.files.localpath import native_path, resolve_local


def readable_files(snapshot: Path, data_dir: Path) -> Iterator[tuple[str, bytes]]:
    rows, calendar = portable_rows(snapshot)
    for name, values in rows.items():
        yield f"portable/{name}.json", (json.dumps(values, default=str, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    yield "portable/calendar.ics", calendar
    versions = {(row["note_id"], row["revision"]): row for row in rows["note_versions"]}
    root = resolve_local(data_dir)
    for note in rows["notes"]:
        version = versions.get((note["id"], note["current_revision"]))
        if version is None:
            raise ValueError("Aktuelle Notizversion fehlt")
        path = resolve_local(data_dir / version["relative_path"])
        if not path.is_relative_to(root):
            raise ValueError("Notizdatei liegt außerhalb der Ablage")
        raw = native_path(path).read_bytes()
        if hashlib.sha256(raw).hexdigest() != version["sha256"]:
            raise ValueError("Notizversion stimmt nicht mit dem Index überein")
        # Preserve front matter and the complete original Markdown content.
        raw.decode("utf-8")
        yield f"portable/notes/{note['id']}.md", raw
    csv_file = io.StringIO(newline="")
    writer = csv.writer(csv_file)
    writer.writerow(["proposal_id", "status", "topic_id", "front", "back", "payload_json"])
    for row in rows["card_proposals"]:
        payload = json.loads(row["payload"])
        writer.writerow([row["id"], row["status"], row["topic_id"], payload.get("front", payload.get("text", "")),
                         payload.get("back", payload.get("extra", "")), json.dumps(payload, ensure_ascii=False)])
    yield "portable/flashcards.csv", csv_file.getvalue().encode("utf-8-sig")
    yield "portable/README.md", """# UniOS-Datenexport

Die JSON-Dateien enthalten Studienobjekte mit stabilen IDs. `relationships.json`
verbindet Objekte; `notes/` enthält die jeweils aktuelle Markdown-Notiz.
Strukturierte Notizbausteine verwenden `:::callout`, `:::entity` und `:::media`
mit Attributen in geschweiften Klammern. Private Medien liegen unter
`data/note-media/`; `/api/note-assets/<Dateiname>` verweist auf diese Dateien.
Details zum offenen Blockformat stehen in `docs/NOTE_STUDIO.md` im UniOS-Repo.
`flashcards.csv` enthält Vorschläge samt Freigabestatus. Falls vorhanden enthält
`anki-notes.csv` die tatsächlichen Anki-Notizen und `anki/collection.anki2` den
vollständigen Schedulerstand. `calendar.ics` kann in Kalenderprogramme importiert werden.
Originale und ältere Notizversionen liegen unter `data/`; Kursmaterialien sind
nur enthalten, wenn beim Export „Dateien einschließen“ gewählt wurde.
`manifest.json` listet Dateigrößen und SHA-256-Prüfsummen. Die SQLite-Datei
enthält zusätzlich alle internen Studienobjekte. Zugangsdaten fehlen absichtlich.
""".encode()


def anki_csv(snapshot: Path) -> bytes:
    csv_file = io.StringIO(newline="")
    writer = csv.writer(csv_file)
    writer.writerow(["note_id", "notetype_id", "tags", "fields_json"])
    with closing(sqlite3.connect(f"{snapshot.as_uri()}?mode=ro", uri=True)) as database:
        for identifier, model, tags, fields in database.execute("SELECT id, mid, tags, flds FROM notes ORDER BY id"):
            writer.writerow([identifier, model, tags, json.dumps(fields.split("\x1f"), ensure_ascii=False)])
    return csv_file.getvalue().encode("utf-8-sig")
