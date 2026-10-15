<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Backend-Schichten

Neue Backend-Domänen folgen dem Pfad HTTP/API → Service → Repository → SQLite und Dateien. Diese Trennung hält Validierung, Fachregeln und Datenzugriff prüfbar.

## Verantwortung

api.py übersetzt HTTP-Eingaben und Ausgaben und prüft die Host-Schreibberechtigung. service.py enthält Fachregeln und Seiteneffekte. repository.py bündelt Abfragen und Schreibvorgänge, trifft aber keine Produktentscheidung. schemas.py kann Typen und Validierung enthalten.

## Bestehender Code

Die Trennung wird bei konkreten Änderungen schrittweise eingeführt. Ein Bereich spricht einen anderen über dessen Service oder eine kleine Schnittstelle an. SQLite mit FTS5 bleibt die lokale Basis; optionale Infrastruktur darf den Kernbetrieb nicht voraussetzen. [Architekturregel](https://github.com/EinfachMxrc/unios-app/blob/main/docs/ARCHITEKTUR.md).
