<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Gemeinsame Entity Actions

`app/entities/actions.py` ist die Registry. Jede Aktion deklariert ID, Objekttyp, Anzeigename, Pydantic-Eingabeschema, erforderliche Fähigkeit, Bestätigung, Handler und MCP-Freigabe. Der Handler wird serverseitig registriert; API-Eingaben dürfen keine Python-Funktionen oder Modulpfade bestimmen.

`GET /api/schema` und `GET /api/schema/{kind}` enthalten die Aktionen. Die automatisch erzeugte [Entitätenreferenz](handbook/developer/entities.md) nutzt denselben Vertrag.

```sh
unios entity actions resource 42 --json
unios entity action resource 42 resource.reextract --dry-run --json
unios entity action resource 42 resource.reextract --yes --json
unios entity action resource 42 resource.index_status --json
unios entity action resource 42 resource.cancel_indexing --yes --json
unios entity action course 7 course.set_activity --input activity.json --yes --json
```

`activity.json`: `{"active": false, "expected": true}`. Der erwartete Kursstatus schützt vor konkurrierenden Änderungen. Eine Vorschau validiert Typ, Objekt und Eingabe, startet jedoch keinen Handler. Schreibende Aktionen benötigen eine gekoppelte Sitzung, gültige Host-Generation und `confirmed: true`. Rechte im Schema ersetzen diese Prüfungen nicht.

REST: `GET /api/entities/{kind}/{id}/actions` liefert den Vertrag; `POST …/actions/{action_id}` nimmt `input`, `dry_run` und `confirmed` an. Lesende Aktionen akzeptieren zusätzlich GET. Die Kursoberfläche und die Reader-Verwaltung verwenden diesen Dispatcher. Unbekannte Aktion, falscher Objekttyp und zusätzliche Eingabefelder werden abgewiesen.

MCP: `run_entity_action` verwendet denselben Dispatcher. Freigegeben sind `resource.index_status`, `assignment.submission_status` und `note.blocks`; Kategorie- und Kursfreigaben gelten unverändert. Der Abgabestatus ist eine gespeicherte Beobachtung mit Prüfzeitpunkt, kein frischer Moodle-Abruf. Notizänderungen, Textextraktion und Abgaben werden darüber nicht freigegeben. Weitere echte Domänenaktionen können gezielt ergänzt werden; die vorgeschlagenen KI-Generierungs-/Merge-Aktionen sind noch nicht Teil dieser Registry.

`note.blocks` liest die Top-Level-Blöcke einer versionierten Notiz.
`note.edit_block` fügt ein, ersetzt, verschiebt oder entfernt einen Block mit
erwarteter Revision und ausdrücklicher Bestätigung; eine veraltete Revision
wird zurückgewiesen. UI-Aktionspalette und Universal-CLI verwenden dieselbe
Registry. Schreibzugriff über MCP bleibt gesperrt. Beispiele und offenes
Blockformat: [NOTE_STUDIO.md](NOTE_STUDIO.md).

## Hintergrundindex

Dateien über 8 MiB und PDFs ab 80 Seiten verlassen den synchronen Indexpfad. Ein einzelner Hintergrundarbeiter entdeckt nach dem Commit fehlende Indizes der neuesten Versionen – auch nach einem Neustart. PDF-Dateien werden direkt vom versionierten Dateipfad gelesen; es entsteht keine zusätzliche vollständige PDF-Bytekopie. Der Reader verwendet weiterhin PDF.js im Web Worker, nur Canvases nahe dem sichtbaren Bereich, feste Seitengrößen und maximal DPR 2.

Die Warteschlange ist auf 64 Aufträge begrenzt. Fortschritt und Abbruch sind pro Version abrufbar. Abbruch wird zwischen PDF-Seiten und vor dem Commit geprüft. Bis zum vollständigen Erfolg bleibt der bisherige Index sichtbar; Originaldateien und vorhandener OCR-Text bleiben erhalten. Fehler liefern einen neutralen Fehlercode. Der Hintergrund-Commit prüft die Host-Generation erneut. OCR wird damit nicht automatisch ausgelöst.

Maximal 512 MiB pro unterstützter Datei. Office-/Textformate nutzen ihre vorhandenen Parser im Hintergrund; deren einzelner Parser-Aufruf ist erst danach abbrechbar. Laufstatus ist pro Prozess, der Suchindex dauerhaft. Nach Neustart werden weiterhin nicht indexierte Versionen wieder entdeckt; eine bewusst abgebrochene Erstindexierung kann dann erneut vorgeschlagen werden. Download/Dateiablage, OCR und Office-Konvertierung besitzen weiterhin ihre eigenen Größen- und Formatgrenzen.
