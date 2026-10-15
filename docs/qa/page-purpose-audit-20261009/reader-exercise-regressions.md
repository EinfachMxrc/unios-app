<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Reader-/Übungsintegration: gezielte Regressionen

Stand: 09.10.2026, letzter gezielter Lauf 20:41:59 Ortszeit. Ausschließlich
synthetische API-Antworten, Dateien und UUIDs; keine privaten Daten oder Dienste.

## Ergebnis

**84 Tests in zehn Vitestdateien bestanden.** Gemeinsamer Typecheck und ESLint
für die veränderten Testdateien bestanden. Dieser Teilauftrag änderte Tests und
QA-Dokumentation. Produktkorrekturen übernahm der koordinierende Hauptagent.

- Reader: erstes POST-ACK wechselt in die bestehende `NoteDocument`-UUID.
  Währenddessen fortgeschriebener Text wird gegen die bestätigte Revision als
  Entwurf übertragen. Gerätefehler bleiben sichtbar; RAM-Text übersteht Remounts
  und wird nach wieder möglichem Schreiben mit späteren Exzerpten zusammengeführt.
- Bestehende Notiz: aktueller RAM-Entwurf hat Vorrang vor einer älteren
  Gerätekopie. Zielwechsel trennt Entwürfe nach UUID. Ein älteres ACK räumt
  keinen neueren RAM-Entwurf ab. Ein gescheiterter Refetch verdeckt weder den
  Editor noch dessen aktuellen Text.
- Vollansicht: der Übergang von einer laufenden Reader-Erstellung bewahrt eine
  einzige UUID. Neuere Ergänzungen, gescheiterte lokale Übertragung und
  Cleanup-Retry erzeugen keinen zweiten POST.
- Vorschläge: 200 Aufgaben erscheinen als zehn Zusammenfassungen pro Seite
  mit höchstens einem ausdrücklich geöffneten Editor. Wechsel und Paging
  bewahren den Entwurf. Suche löst eine bisherige Zielraute. Pending wird über
  Remount geteilt; ACKs bleiben an ihre Aufgabe und den gesendeten Inhalt
  gebunden. Ein alter Listen-Cache ersetzt keine eben bestätigte Speicherung.
- Üben: aktive Antwort bleibt während Suche und Refetchfehler sichtbar.
  Gemeinsam gespeichertes Pending verhindert einen zweiten Versuch nach
  Remount. Späte ACKs schließen nur die unveränderte gesendete Antwort.

Im Review gefunden und anschließend durch Regressionen abgesichert:
lokales Übungs-Pending bei gemeinsamem Entwurf; Rücksetzen einer bestätigten
Vorschlagsänderung durch einen alten Listen-Cache; zweiter Quellen-POST beim
Wechsel in die Vollansicht mit inzwischen ergänztem Text.

## Prüfumfang

`noteDraft.test.ts`, `NoteDocument.test.tsx`, `NewNote.test.tsx`,
`ReaderStudyTools.test.tsx`, `readerExcerpt.test.ts`, `ExercisePage.test.tsx`,
`PracticePanel.test.tsx` sowie die drei Organisationsregressionen
`DeadlineCampusTime.test.tsx`, `RevisionDraftSafety.test.tsx`,
`calendarEditing.test.ts`.

Die acht Campus-/DST-Tests prüfen reguläre Zeitpunkte, wiederholte Stunden,
Sekundenreferenzen, explizites Löschen und Ablehnung der Frühlingslücke. Eine
Laufzeitänderung von `TZ` unter Windows-Node-Workerthreads erwies sich im
Gesamtlauf als unzuverlässig; die doppelte Gerätezonensimulation wurde entfernt.
Tatsächliche UTC-/Berlin-Browserzonen prüfen die vier vorhandenen
`deadline-campus-time.spec.ts`-Fälle mit Playwright-`timezoneId`.

## Browserfälle vorbereitet

`reader-workspace.spec.ts` prüft ausdrücklich das Verschwinden des
Erstellungsformulars nach ACK, Fortsetzung mit einem weiteren PDF-Exzerpt,
Titel-/Abschnittsänderung im normalen NoteStudio, PUT mit erwarteter Revision,
genau einen POST, dieselbe UUID nach Reload und den PDF-Link auf die passende
Seite. `exercise-proposals.spec.ts` öffnet Importdetails und danach ausdrücklich
den betreffenden Vorschlagseditor.

**In diesem Teilauftrag kein Browserlauf und kein Build.** Der Hauptagent
übernimmt diese Fälle gegen das gebaute Paket. RAM-Erhalt gilt für das geöffnete
Fenster; er ist keine dauerhafte Gerätekopie und kein Beleg für Wiederherstellung
nach App-Neustart.

## Ergänzung: freie Mitschrift beim ersten Speichern

Der abschließende Check bestätigte vier Fehler in fünf neuen Regressionen vor
der Korrektur: Eine freie Mitschrift verlor Text B nach dem POST von A,
stellte nach Remount die ältere Gerätekopie wieder her, verlor die bestätigte
UUID bei lokalem Cleanupfehler und ließ ein altes ACK einen neu gepaarten
Arbeitsbereich beeinflussen.

Freie und quellgebundene Erstellung teilen nun den temporären Pending-/ACK-
Speicher mit Arbeitsbereichsgrenze. Späterer Text wird als Entwurf gegen die
bestätigte UUID übertragen. Lokale Fehler lassen diese Bestätigung bestehen;
„Mitschrift fortsetzen“ wiederholt ausschließlich die lokale Übertragung.
„Neue Notiz“ beginnt ausdrücklich ein weiteres freies Dokument. Nicht
übertragener Text und seine UUID werden auch bei Druck auf das Cachelimit
zusammen bewahrt.

**30 gezielte Tests in vier Dateien bestanden:** `NewNote.free.test.tsx`,
`NewNote.test.tsx`, `ReaderStudyTools.test.tsx`, `readerNoteSave.test.ts`.
Typecheck und gezieltes ESLint bestanden. Die Vitest-Notizstudio-Attrappe
erhält den relevanten Browservertrag `contentEditable` im deaktivierten
`fieldset`; sie ersetzt keine Prüfung des echten TipTap-Editors.

`free-note-save.spec.ts` ergänzt genau dafür den echten Editorpfad mit
verzögertem POST-ACK, Weiterschreiben, Remount, synthetischem Quotafehler,
Wiederaufnahme derselben UUID und ausdrücklich neuer freier Notiz. Der
Hauptagent führt diesen neuen Browserfall aus; hier wurde kein Browserdienst
gestartet. Produktänderungen dieses engen Ergänzungschecks liegen in
`NewNote.tsx`, `sourceNoteSave.ts` und dem Neu-Intent in `NotesPage.tsx`.
