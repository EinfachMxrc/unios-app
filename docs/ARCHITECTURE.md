<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Architektur

UniOS ist ein Einzelnutzer-System mit genau einem schreibenden Host. Dieser betreibt
SQLite, versionierte Dateien, Connectoren und Hintergrundaufträge. Native Tauri-
Clients können einen eigenen HTTPS-Server verwenden; deren versteckter Begleitprozess
ist dann eine authentifizierte Brücke, kein zweiter Studiendaten-Server.

```text
React / Tauri / CLI / MCP
          │
HTTP/API-Validierung + Host-/Geräte-/Agentrechte
          │
Fachservices ─ Entity Schema / Actions
          │
Repositories ─ SQLite + versionierte Dateien
          │
Abgeleiteter Corpus / FTS / Chunk-Handles / Changefeed

Connectoren → sequentieller Sync → Extraktion/Index-Aufträge
```

## Code und Grenzen

| Ort | Verantwortung |
| --- | --- |
| app/ | Backend-Domänen; api.py validiert, service.py entscheidet, repository.py speichert |
| app/connectors/ | Öffentliche v1-Verträge, Manifeste, Rechte, isolierter Containerworker |
| app/host/, app/server/ | Schreibrolle, Snapshots/Restore, Server und Gerätekopplung |
| app/corpus/, app/ai/ | Quellenindex und Agent Gateway; aktuelle Rechte werden vor Retrieval geprüft |
| app/coding/, app/assessment/ | Versionierte Lernaufgaben, unveränderliche Versuche, deterministische Prüfer |
| frontend/ | React, i18n, Browseraufgaben und Unit-Tests |
| desktop/ | Tauri-Hülle, Sidecar, native Login-/Fenster-/Updateintegration |
| alembic/ | Versionierte Datenbankschritte; echter Bestand nur nach geprüftem Snapshot |
| institutions/ | Profilkonfiguration, ausdrücklich unbekannte Portalwerte bleiben offen |
| deploy/, scripts/ | Betrieb, Builds und begrenzte Prüfhilfen |
| tests/ | Erfundene Fixtures, lokale Fakes und deterministische Randfälle |

Originale und freigegebene Quelle sind von abgeleiteten Chunks/Zusammenfassungen
getrennt. Quellenhandles binden Version und Inhalt; FTS braucht keinen externen
Vektordienst. MCP bietet search, fetch, outline, context, graph, changes, act, jobs.
Auch historische Handles umgehen keine heutigen Kurs-/Kategoriefreigaben.

Untrusted Connectoren laufen ohne eigenes Netz/Hostmounts im begrenzten Container;
WASM-Addons ohne WASI/Imports im eigenen Worker. Trusted-Python ist eine ausdrücklich
andere Entwicklungsoption. Lernenden-Code läuft beim eingerichteten VPS in einer
getrennten Runner-VM ohne UniOS-Dateien. Diese Trennung ersetzt keine OS-Patches.

Ein generisches Pluginrecht gewährt keine Moodle-Abgabe und keine PRIMUSS-Schreibaktion.
Cloud-KI ist optional; Work-Vorschläge sind keine deterministischen Noten.
Details: [SERVER](SERVER.md), [AGENT_GATEWAY](AGENT_GATEWAY.md),
[CONNECTOR_PLUGINS](CONNECTOR_PLUGINS.md), [ASSESSMENT_ENGINE](ASSESSMENT_ENGINE.md),
[RUNNER](RUNNER.md). [Abnahme](RELEASE_READINESS.md) dokumentiert Grenzen.
