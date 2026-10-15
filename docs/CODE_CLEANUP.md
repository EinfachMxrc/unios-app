<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Codebereinigung vom 03.10.2026

[Interaktiver Bericht](CODE_CLEANUP.html) mit aufklappbaren Entscheidungen.

## Entfernt

| Teil | Nachweis |
| --- | --- |
| `ui/select.tsx`, `ui/separator.tsx`, `ui/tabs.tsx` | Keine statischen oder dynamischen Imports, Reexports oder Verbraucher. Die App verwendet ihre eigenen Tabs und native Selects. |
| `lib/utils.ts` und `components.json` | Der Shadcn-Generator wurde bereits entfernt; der einzige Verweis auf den ungenutzten Reexport war dessen zurückgelassene Konfiguration. Aktive Komponenten importieren `cn` direkt. |
| Sieben Typ-Aliasse | `SidebarEntry`, `GroupAssignment`, `ResourceVersion`, `CalendarEvent`, `SyncRun`, `SearchHit`, `NoteSummary` hatten keine Verbraucher außerhalb ihrer Definition. Die generierten API-Schemas bleiben maßgeblich. |
| `@tauri-apps/plugin-updater` im Frontend | Die App verwendet `check_release_updates` und `install_release_update` über Rust. Das JS-Paket hatte keine Imports. Das tatsächlich aktive native Updater-Plugin bleibt eingebunden. |

Der neue Editor heißt in der Notizseite jetzt direkt `NoteStudio`; der alte
Alias `NoteMarkdownEditor` entfällt. Der Markdown-Quelleditor ist weiterhin
eine genutzte Funktion innerhalb des Studios.

Die schon verwendete `@tauri-apps/api` ist nun direkt mit der bereits
aufgelösten Version 2.12.0 deklariert. Bisher kam sie indirekt über Plugins.
Keine vorhandene Paketversion wurde aktualisiert. Npm ergänzte lediglich
Metadaten bereits gebündelter optionaler Tailwind-WASM-Abhängigkeiten.

## Geprüft und weiterhin benötigt

| Bereich | Tatsächlicher Verbraucher |
| --- | --- |
| `app/client/api.py` | `desktop/backend.py` startet damit den Begleitdienst der nativen Serverclients. |
| `app/addons/wasm_worker.py` | Separater Prozess über `app/addons/runtime.py`; im eingefrorenen Paket über `desktop/backend.py`. |
| `app/connectors/container_worker.py` | Dokumentierter Container-/Stdio-Vertrag für Connector-Plugins. |
| `clients/uni_mcp/remote.py`, `oauth_provider.py` | Remote-MCP-Einstieg im Compose-Overlay, einschließlich OAuth. |
| `app/setup/protocol_handler.py` | Registrierter Moodle-Rückruf für den unterstützten Quellbetrieb. |
| `app/host/`, lokale Dienstinstaller und Syncthing | Der lokale Betrieb wird weiterhin unterstützt. Übernahme/Abgabe sind im Servermodus gesperrt; Snapshots und Schreibschutz werden auch auf dem VPS benötigt. |
| Alte Migrationen | Aufbau neuer Installationen und Aktualisierung älterer Datenbanken. |
| TypeScript 5.9 + separater 7-Compiler | Unterschiedliche Verbraucher: ESLint/OpenAPI-API und nativer Compiler. |
| Vendored GLib | Dokumentierter Sicherheitsbackport für den Linux-/GTK-Unterbau. |
| Frühere Icon-Dateien | Bewusst erhaltene Vorgänger des neuen Brand-Kits. |

## Umfang und Grenzen

Vor der Bereinigung wurden 379 Frontend-Quell-/CSS-Dateien über ihren
Importgraphen betrachtet. Übersetzungen werden dynamisch geladen und als
solche berücksichtigt; Tests und generierte Typen sind eigene Einstiegspunkte.
Nach der Bereinigung liefert derselbe Scan keine weiteren verwaisten
Frontend-Laufzeitdateien. Ein zunächst gemeldetes Tailwind-Paket wird durch
`vite.config.ts` verwendet und ist kein Löschkandidat.

552 Python-Dateien in Anwendung, Clients, Werkzeugen, Deployment und Tests
wurden auf unreferenzierte private Funktionen und identische größere
Funktionskörper geprüft. Daraus ergab sich kein weiterer eindeutig entfernbarer
Teil. Ein zweiter Modulgraph sowie die Prüfung von Desktop-, Compose- und
Plugin-Einstiegen erklärten die scheinbar ungenutzten Worker oben.
Zusätzlich wurden native Befehlsregistrierung, Abhängigkeitsmanifeste,
Lizenzhinweise und die Verweise der Betriebsskripte geprüft.

Das ist eine Prüfung von Erreichbarkeit und Integrationsstellen, keine
Behauptung, jede Zeile oder jeden historischen Kompatibilitätsvertrag geprüft
zu haben. Ein ausschließliches Serverprodukt würde eine ausdrückliche Änderung
des weiterhin unterstützten lokalen Betriebs erfordern. Dokumentation,
Prüfwerkzeuge und versionierte Quellen sind von lokalem Build-/Testcache zu
unterscheiden; solche ignorierten Arbeitsverzeichnisse wurden nicht pauschal gelöscht.

## Verifikation

Typecheck, ESLint, alle 395 Frontend-Tests, Produktionsbuild, npm-CI-Lockprüfung
im Dry-Run sowie SPDX, Ruff und mypy für den angepassten Lizenzprüfer bestehen.
Alle 26 passenden Browserabläufe für Startseite, Notizeditor, Raumbuchung
und Seitenleiste gegen die Fake-App bestanden ebenfalls.
Es gibt keine Änderung an Datenbankschema, HTTP-Vertrag oder installierter App.
