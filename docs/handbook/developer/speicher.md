<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Dateien und Suche

SQLite hält lokale Metadaten; Dateiversionen bleiben als Originale erhalten. Der Suchindex kann aus dem lokalen Bestand neu aufgebaut werden.

## Dateivertrag

Ein erneuter Download überschreibt nicht die bisherige Fassung. Markierungen und andere Arbeitsdaten werden als eigene Daten neben dem Original gehalten. Bei Migrationen und Hostwechseln muss ein geprüfter Snapshot den zusammengehörigen Stand von Datenbank und Dateien sichern.

## Suche reparieren

Die CLI bietet uv run unios rebuild-index. Nutze den Befehl bei einem beschädigten oder veralteten Index erst nach Prüfung des Hostzustands. OCR für Bild-PDFs ist ein gesonderter lokaler Schritt mit Tesseract; die [OCR-Doku](https://github.com/EinfachMxrc/unios-app/blob/main/docs/OCR.md) beschreibt die Grenzen.
