<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Inhalt-Tabs: gezielte Abnahme vom 16.10.2026

Implementierung: `docs/NOTION_UMBAU.md`, Paket 1. Ausschließlich erfundene lokale
Fixtures; keine Hochschule und kein vorhandener persönlicher Datenbestand.

## Verhalten

- Kontextmenü an internen Links: in weiterem UniOS-Tab öffnen. Desktop-Brücke:
  zusätzlich Cmd/Strg-Klick, Mittelklick und Tab-Tastenkürzel. Browser-Kürzel
  bleiben im normalen Browser dessen eigene Navigation.
- Normale Navigation ersetzt den aktiven Inhalt. Bereits offene Dokumente werden
  wiederverwendet; PDF-Seiten oder Notizrevisionen erzeugen keine zweiten Editoren.
- Schließen löscht kein Dokument. Bis zu zehn geschlossene Tabs bleiben während
  dieses Fensterlaufs wiederöffnbar; maximal 24 offene Tabs. Die offene Reihenfolge
  bleibt beim Neuladen im selben Browserfenster erhalten.
- Tabdaten speichern Kennungen und erlaubte Navigationsparameter. Titel, Zitate,
  Suchtexte, Route-State und Formularwerte werden nicht in die Tab-Liste geschrieben.
  Dokumententwürfe verwenden unverändert ihre bisherigen Sicherungswege.
- Visueller und Markdown-Cursor bleiben beim Wechsel erhalten. Das Fieldset enthält
  jetzt ein normales inneres Raster, damit wiederhergestellte Editoren sichtbar und
  fokussierbar bleiben.

## Nachweise

`workspace-tabs.spec.ts`: acht Fälle für PDF-Seite 12, 150 % Zoom, ungespeicherte
Mitschrift, Cursor in beiden Editormodi, Reihenfolge/Fokus, neue Suche, Neuladen,
Desktop-Kürzel und Desktop-Links aus dem Editor sowie 1.440/390-Pixel-Ansichten.
Zusätzlich beide bestehenden Fälle aus `desktop-note-links.spec.ts` bestanden.
1.477 Frontendfälle sowie Typen, Lint, Übersetzungen und Produktionsbuild bestanden;
gezielte Link-/Navigationsfälle nach der letzten Capture-Änderung erneut bestanden.
Bestehende Offline- und Bundle-Budgets eingehalten, keine Grenzwerte erhöht.

Python: 1.385 bestanden, acht Skips, macOS-Signaturtest separat ausgeschlossen,
nachdem sein Wegwerf-Zertifikat `CSSMERR_TP_NOT_TRUSTED` lieferte. Ruff, mypy und
OpenAPI bestanden. Das ist keine native Signaturabnahme.

`lighthouse-summary.json` enthält acht Snapshots: Notizeditor und neuer Tab,
jeweils Hell/Dunkel und 1.440/390 Pixel, 96–100 Accessibility, keine Laufzeitfehler.
Screenshots selbst auf Lesbarkeit, Navigation und Überlauf geprüft. Die Audit-
Datei enthält den Hash des zugehörigen Vorschau-Builds. Der spätere Desktop-
Capture-Guard verändert diese Darstellung nicht; sein Verhalten ist separat geprüft.

## Gemeinsame Abschlussprüfung noch offen

Der erste vollständige Lauf wurde nach 238 bestandenen Fällen beendet, nachdem
breite Testselektoren für „Inhalte“ mit der neuen Navigation kollidierten und der
isolierte Übergabefall noch den alten Fake-Syncthing-Port ansprach. Die Selektoren
werden auf ihre echten Comboboxen begrenzt. Die abschließende, vollständig isolierte
Suite folgt mit den weiteren Paketen. Diese Zwischenabnahme behauptet keinen
vollständig grünen Browser-Gesamtlauf, kein natives Update und kein Deployment.
