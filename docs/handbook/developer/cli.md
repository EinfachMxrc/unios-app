<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# CLI

Die CLI heißt unios und spricht viele der lokalen Funktionen des Hosts an. Zeige die vollständigen Optionen mit uv run unios --help oder für einen Unterbefehl mit --help an.

## Häufige Befehle

- uv run unios status zeigt den lokalen Zustand.
- uv run unios courses listet Kurse.
- uv run unios search SUCHBEGRIFF sucht im lokalen Bestand.
- uv run unios doctor prüft die lokale Installation.
- uv run unios host status zeigt die Hostrolle.
- uv run unios demo create und demo serve starten eine isolierte Demo.
- uv run unios schema --json zeigt den gemeinsamen Entitäts- und Beziehungsvertrag.
- uv run unios describe note --json erklärt einen Objekttyp; `describe host status` beschreibt weiterhin einen CLI-Befehl.
- uv run unios entity list course --json und `entity get note ID --json` lesen öffentliche Felder.
- uv run unios entity search note SUCHWORT --json sucht in öffentlichen Titelfeldern; `entity links note ID --json` zeigt gerichtete Beziehungen und Rückverweise.
- uv run unios relate topic 1 prerequisite topic 2 --dry-run zeigt eine geplante Verbindung; `--yes` führt sie aus.
- uv run unios unlink topic 1 KANTEN_ID --dry-run prüft einen Rückverweis; `--yes` löst ihn.

Die bisherigen Vorschlagsformate bleiben mit `unios schema cards`, `exercises`, `explanations` oder `all` erreichbar.

## Vorsicht bei Änderungen

Hostwechsel, Sync, Backup und API-Schreibmethoden haben eigene Vorbedingungen. Prüfe die Hilfe und erstelle vor Migrationen einen Snapshot. Der Quellcode der [CLI](https://github.com/EinfachMxrc/unios-app/blob/main/app/cli/main.py) ist für die aktuelle Optionsliste maßgeblich.
