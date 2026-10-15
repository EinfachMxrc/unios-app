<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Backend-Schichten

Neue Domänen folgen einem kleinen, gerichteten Aufbau:

```text
HTTP/API → Service → Repository → SQLite/Dateien
```

`api.py` übersetzt HTTP-Eingaben und Ausgaben, prüft die Host-Schreibberechtigung und ruft den Service. `service.py` enthält die Fachregeln und entscheidet über Seiteneffekte. `repository.py` bündelt Abfragen und Schreibvorgänge; dort stehen keine Produktentscheidungen. Typen und Validierung dürfen in `schemas.py` liegen. Ein Bereich importiert den anderen über dessen Service oder eine kleine gemeinsame Schnittstelle statt über dessen Tabellenabfragen.

Bestehende Module werden nur dann angepasst, wenn dort ohnehin eine Funktion geändert wird. So bleibt das aktuelle Produkt nutzbar, während neue Funktionen bereits die Trennung einhalten. Die lokalen Demo-Daten, Laufzeiteinstellungen und Integrationsfähigkeiten dienen als erste Beispiele. SQLite mit FTS5 bleibt die Datenbasis; optionale Infrastruktur wird nicht zur Voraussetzung für den Kernbetrieb.
