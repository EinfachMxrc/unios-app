<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Der UniOS-Notizeditor

Stand: 16.10.2026. Der Editor wurde nach dem Vorbild von Notion neu aufgebaut:
eine Seite besteht aus **Blöcken**. Der frühere Markdown-Quelltextmodus
(„Studio“) ist entfallen; Markdown bleibt nur Tipp-Kürzel, Import und Export.

## Schreiben

- **`/`** am Zeilenanfang öffnet die Blockauswahl (Pfeiltasten, Enter oder Tab,
  Escape schließt): Text, Überschriften 1–3, Aufzählung, nummerierte Liste,
  Checkliste, Aufklappbereich, Zitat, Trennlinie, Code, Tabelle, die neun Lernkästen
  (Hinweis, Definition, Merksatz, Beispiel, Lerntipp, typischer Fehler, offene
  Frage, Wichtig, Zusammenfassung), Formel, Abruffrage, Ablaufdiagramm,
  Schreibraster, Wahrheitstabelle, Rechenhilfe, Bild/Audio/Video und
  UniOS-Verknüpfung.
- **Kürzel** wie in Notion: `#`/`##`/`###` + Leerzeichen, `-`, `1.`, `[]`,
  `>` (Aufklappbereich), `"` (Zitat), ```` ``` ````, `---`, `$x^2$`, `$$…$$`,
  `==Markierung==`.
- **Verschachteln wie in Notion:** Tab rückt jeden Block unter den darüber ein
  (Absatz, Überschrift, Tabelle, Medien, auch Listen; unter Aufklappbereiche,
  Hinweise und Zitate wandert er hinein), Umschalt+Tab holt ihn zurück.
  Unterblöcke wandern beim Verschieben und Duplizieren mit; Rücktaste am
  Blockanfang und Enter in einem leeren eingerückten Block rücken ebenfalls
  zurück. Gespeichert werden echte Unterblöcke (`children`), bis zu sechs Ebenen.
  In Code rückt Tab um zwei Leerzeichen ein.
- **Block-Kürzel:** ⌘/Strg+Umschalt+↑/↓ verschiebt den Block samt Unterblöcken,
  ⌘/Strg+D dupliziert ihn, ⌘/Strg+Alt+0 Text, 1–3 Überschrift 1–3, 4 Checkliste,
  5 Aufzählung, 6 Nummerierung, 7 Aufklappbereich, 8 Code; ⌘/Strg+Enter hakt
  eine Aufgabe ab beziehungsweise klappt einen Aufklappbereich auf oder zu.
- **`[[`** schlägt Notizen zum Verlinken vor.
- **Auswahl-Leiste** über markiertem Text: fett, kursiv, unterstrichen,
  durchgestrichen, Code, Markierung, Link und – bei gespeicherter Notiz –
  „Lernkarte aus Auswahl“.
- **Block-Griff** links neben jedem Block: ziehen zum Umordnen, „+“ fügt darunter
  einen Block ein, das Menü verschiebt, dupliziert und entfernt ihn oder
  wandelt ihn in einen anderen Texttyp um („Umwandeln in“).
- Typisierte Lernkürzel wie `/hex`, `/bin`, `/matrix`, `/grenzwert`, `/kv`,
  `/diagramm`, `/ueben` öffnen das jeweilige Werkzeug mit Voreinstellung;
  ⌘/Strg+Umschalt+M öffnet die Formeleingabe im Satz, ⌘/Strg+Umschalt+Leertaste
  die Rechenhilfen. Abbrechen lässt den getippten Befehl stehen.
- **Gliederung** zeigt die Überschriften, **Fokus** blendet den Kontext aus.
- Medien werden per Dialog, Dateidrop oder Einfügen aus der Zwischenablage privat
  gespeichert (PNG, JPEG, WebP, MP3, WAV, OGG, MP4, WebM; bis 25 MB).

## Speicherformat

Jede Revision ist ein **Blockdokument** (JSON, `unios-note-blocks`, Version 1):

```json
{"version": 1, "blocks": [
  {"id": "a1b2c3d4e5f6", "type": "heading", "props": {"level": 2},
   "content": [{"type": "text", "text": "Rekursion"}], "children": []}
]}
```

Blocktypen: `paragraph`, `heading`, `bullet`, `numbered`, `todo`, `toggle`,
`quote`, `callout`, `code`, `divider`, `table`, `media`, `entity`, `equation`,
`study`. Jeder Block trägt eine stabile ID; Inline-Inhalte sind Text mit Marken
(`bold`, `italic`, `strike`, `code`, `underline`, `highlight`) und Link,
`[[Notizlink]]` und Formel. Die Datei liegt wie bisher unveränderlich unter
`DATA_DIR/notes/…` mit SHA-256; Revisionen, Konflikterkennung (`expected_revision`),
Schreibrecht und Undo über die lokalen Aktionen gelten unverändert.

**Ältere Notizen** bleiben als Markdown-Dateien unangetastet. Beim Lesen werden sie
deterministisch in Blöcke umgewandelt (`:::callout`, `:::fold`, `:::entity`,
`:::media`, Tabellen, Listen, `$…$`, `\[…\]`, `==…==`, Lernblöcke); erst das nächste
Speichern erzeugt eine neue Blockrevision. Unbekannte `:::`-Erweiterungen bleiben
als sichtbarer Text erhalten. Es gibt keine Datenbankmigration.

Suche, Rückverweise, Vorschau, Prüfungsaufgaben und Korpus arbeiten auf einer
Klartext-Projektion. `body` in der API und `GET …/notes/{id}` ist die
Markdown-Ansicht des Dokuments; `document` das eigentliche Blockdokument.
`POST`/`PUT` nehmen `document` oder – für CLI, Import und GPT – `body` (Markdown)
an; dabei bleiben Block-IDs unveränderter Abschnitte erhalten.

## Entwürfe und Zusammenführen

Lokale Entwürfe halten dasselbe Dokument als **eine JSON-Zeile je Block**. Dadurch
führt der vorhandene zeilenbasierte Dreiwege-Abgleich Änderungen an verschiedenen
Blöcken automatisch zusammen; Änderungen am selben Block verlangen wie bisher eine
Entscheidung („Beide behalten“ hängt die andere Fassung nach einer Trennlinie an).

## Blöcke über Registry und CLI

`note.blocks` liest die Top-Level-Blöcke (mit `id`, `type`, `markdown`) und die
Revision; `note.edit_block` unterstützt `insert`, `replace`, `move`, `delete`,
verlangt `expected_revision` und ausdrückliche Bestätigung und legt eine neue
Version an.

```shell
unios entity action note <id> note.blocks --json
unios entity action note <id> note.edit_block --input edit.json --yes --json
```

```json
{"expected_revision":1,"operation":"replace","index":0,"markdown":"# Neuer Titel"}
```

## Export

Der portable Export enthält je Notiz `notes/<id>.md` (lesbare Markdown-Ansicht;
Unterstreichung, Markierung und Aufklappbereiche haben dort kaum Entsprechung)
und `notes/<id>.json` mit dem vollständigen Blockdokument.

## Abhängigkeiten

Tiptap 3 / ProseMirror (Tastatur, Auswahl, Tabellen, Undo), Lowlight (Code),
KaTeX und MathLive (Formeln), Fira Code. Die Tiptap-Markdown-Erweiterung dient nur
noch dazu, die Markdown-Ausgabe der Lernwerkzeuge in Blöcke zu übersetzen.

## Grenzen / noch nicht umgesetzt

- Zellen von Tabellen enthalten Text, keine Blöcke; keine Spaltenlayouts.
- Der Griff zieht nur den einzelnen Block; Unterblöcke bleiben beim Ziehen mit der
  Maus stehen (Tastatur und Menü nehmen sie mit). Mehrfachauswahl von Blöcken,
  Text-/Hintergrundfarben und Erwähnungen mit `@` fehlen noch.
- Kommentare, Datenbank-Ansichten, Seiten-Icons/Cover und Versionsvergleich auf
  Blockebene sind nicht Teil dieses Umbaus.
- Favoriten und zuletzt benutzte Formelvorlagen der früheren Werkzeugleiste
  sind entfallen; Vorlagen sind über `/Formel` und die Kürzel erreichbar.
- Auf echten Geräten prüfen: IME/Diktat, Systemzwischenablage, Dateidrop aus
  Finder/Explorer, Videocodecs der Webview, Mac-Tastenkürzel.
