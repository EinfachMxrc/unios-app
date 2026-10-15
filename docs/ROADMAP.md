<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Roadmap bis zur Veröffentlichung

## Aktuelle Entscheidung – 04.10.2026

**Alpha-Feinschliff und Corpus-Ausbau**, Feature Freeze für neue sichtbare Bereiche.
Standard: Heute, Kurse, Lernen, Termine. Weitere Studienwerkzeuge bleiben erreichbar,
technische Werkzeuge sind eingeklappt. Umsetzung und Grenzen:
[ALPHA_FOCUS.md](ALPHA_FOCUS.md), [AGENT_CORPUS_SCALE.md](AGENT_CORPUS_SCALE.md).
Marc hat GitHub-Uploads inzwischen ausdrücklich beauftragt. Die September-Abschnitte
dokumentieren frühere Entscheidungen; sie sind keine aktuelle Push-Sperre oder
Aufgabenteilung.

Stand 26.09.2026. Grundlage: Code-Review vom selben Tag (Befunde im Code gegengeprüft). Marc hat beauftragt, **alle** Punkte umzusetzen. Reihenfolge ist verbindlich, weil spätere Pakete auf früheren aufbauen (Migrationen linear, Umbenennung vor i18n).

## Getroffene Entscheidungen

- **Namensentscheidung geändert: UniOS bleibt der Name** (nicht Keystone, siehe Zeile darunter). App-Titel, PWA-Manifest und Paketname stehen bereits auf UniOS; der CLI-Befehl heißt weiterhin `unios`. Der Session-Cookie wurde von `keystone_session` auf `unios_session` umbenannt (alte Geräte-Sitzungen werden beim nächsten Zugriff automatisch migriert, siehe `app/session_api.py`).
- ~~**Neuer Name: Keystone.** Paketname, README, App-Titel, PWA-Manifest, CLI-Hilfetexte. Der CLI-Befehl `unios` bleibt als Alias bestehen, neuer Hauptbefehl `keystone`.~~ (überholt, siehe Zeile darüber)
- **Git:** neues Repo direkt in `unios`, erster Commit nach dem Aufräumen, danach ein Commit pro Arbeitspaket (Conventional Commits). **Kein Push** – das macht Marc.
- **i18n:** Infrastruktur plus alle UI-Texte Deutsch und Englisch, Sprachumschalter in den Einstellungen, Deutsch bleibt Standard.
- **KI-Adapter:** echter Anthropic-Adapter wird ergänzt, bleibt standardmäßig aus, harte Budgetgrenze gilt unverändert.
- Außer dieser Session arbeitet kein anderes Tool mehr am Ordner.

## Stand 27.09.2026

Ein zweites Werkzeug arbeitet parallel an Oberfläche und einzelnen Backend-Funktionen. Marc hat deshalb festgelegt: Claude übernimmt nur das **Backend**, die Oberfläche bleibt beim anderen Werkzeug.

**Erledigt (Backend, je ein Commit):**
- 0 Aufräumen und Git: Temp-Ordner nach `../_aufgeraeumt-2026-09-26/` verschoben, `.gitattributes` (LF), Secret-Scan, Repo angelegt.
- 1 Sicherheit: Host-Allowlist gegen DNS-Rebinding und Security-Header (`b93241a`); Gerätekopplung mit Session-Cookie, automatischer Kopplung des lokalen Browsers, `unios pair` für weitere Geräte und iCal-Token (`7b47b8f`); MCP-Lesezugriffe geschützt; DNS-Prüfung der öffentlichen Semesterzeiten.
- 3 Qualität: blockierende Arbeit aus `async`-Handlern, N+1 beseitigt, 10 Indizes, zentrales `as_utc()`, Lernblock-Zeitzone korrigiert, Snapshot-Backoff (`319ad14`).
- 4 (Backend-Teil): Coverage-Schwelle 80 %, `mypy app tests`, Reset-Endpunkt `POST /api/__test__/reset` für die Fake-Server (`cd95cb7`).
- 5 CLI: `search`, `deadlines`, `anki queue`, `ai export`, `cards import|export`, `describe`, `setup` (`d352089`).
- 6 (Backend-Teil): Anthropic-Adapter, standardmäßig aus, Budget über alle Modelle (`9571311`, `1e50f0b`); Datenexport (`98df404`); Themen zusammenführen (`a44d327`); Lernblöcke weichen Terminen aus (`8a458a4`); Plugin-Vorlage `examples/connector-plugin/` und `docs/PLUGINS.md` (`b92aae4`).
- PWA-Share-Target hat das andere Werkzeug bereits gebaut.

**Erledigt (Oberfläche, je ein Commit):** UI für Gerätekopplung und iCal-Link (`85f393c`), Datenexport (`0ad2a3e`), Themen-Zusammenführung (`997be5d`), KI-Adapter-Auslöser (`2b0841d`), Fokus-Timer für Lernblöcke des Tages (`1d21465`); Namensentscheidung auf UniOS bestätigt inklusive Session-Cookie-Umbenennung mit Rückwärtskompatibilität (siehe oben).

**Weiterhin offen, liegt bei der Oberfläche:** Anzeigename statt „Guten Tag, Marc.“, Hochschulauswahl im Assistenten, alle Frontend-Punkte aus Paket 4 (Mutation-Hook, stille Fehler, MaterialPage aufteilen, Lazy Loading, generierte Typen, semantische Überschriften, DOMPurify, Vitest), die e2e-Specs vor jedem Lauf `POST /api/__test__/reset` aufrufen lassen und den veralteten Text „Programmieren 1 zuordnen“ in `phase1.spec.ts` anpassen, i18n, Demo-Modus, README-Screenshots.

## Pakete

### 0 · Aufräumen und Git
- 47 Temp-Ordner (`t-*`, `tmp*`, `test-temp`, `pytest-cache-files-*`, `.pytest-*`) **nicht löschen**, sondern nach `../_aufgeraeumt-2026-09-26/` verschieben.
- `.gitignore` um diese Muster ergänzen.
- `git init`, Secret-Scan (`detect-secrets`, vorhandene `.secrets.baseline`) über den Stand, erster Commit.

### 1 · Sicherheit (vor Veröffentlichung Pflicht)
- **Host-Allowlist** gegen DNS-Rebinding (`app/main.py`): nur `127.0.0.1`, `localhost`, `[::1]` und konfigurierte Tailscale-Namen (`ALLOWED_HOSTS`). Heute passiert nach Rebinding auch die Schreibsperre, weil `Origin` = `Host`.
- **Lokales Session-Token:** Kopplung beim ersten Start (Einmalcode im Terminal/Assistent), danach HttpOnly-Cookie `SameSite=Strict`; jede `/api`-Route prüft es unabhängig von `Origin`. iCal-Feed erhält eigenen Lesetoken in der URL.
- MCP-Routen `/api/ai/mcp/state` und `/audit` verlangen das MCP-Token (`app/ai/mcp_api.py:79`).
- Globale Security-Header-Middleware: CSP, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`.
- Niedrig: MCP-Actor nur bei Loopback als `local` werten; DNS-Pinning im Abruf der öffentlichen Semesterzeiten.
- Tests: Rebinding-Host abgewiesen, fehlendes Token → 401, Header vorhanden, E2E-Fixtures mit Kopplung.

### 2 · Veröffentlichungsreife
- ~~Umbenennung in Keystone~~ entfällt: Name bleibt **UniOS** (siehe „Getroffene Entscheidungen“ oben).
- Anzeigename konfigurierbar statt „Guten Tag, Marc.“ (`frontend/src/pages/Today.tsx:43`), Eingabe im Einrichtungsassistenten.
- Hochschule nicht mehr stillschweigend `hs-coburg`, sondern Auswahl im Assistenten.

### 3 · Backend-Qualität und Performance
- Blockierende Arbeit aus `async`-Handlern holen (`app/anki/study_api.py:349`, `:363`).
- N+1 beseitigen: `_card()` revlog pro Karte (`study_api.py:94`), Versionen pro Ressource (`app/web/api.py:243`), `app/learning/progress.py`, `app/ai/costs.py`.
- Eine Migration mit Indizes: `Change.created_at/course_id/kind`, `Resource.course_id`, `Assignment.course_id`, `Announcement.course_id`, `CourseSection.course_id`.
- Zentraler `TZDateTime`-TypeDecorator statt dreier `aware()`-Kopien; beseitigt die SQLite-DeprecationWarning.
- **Bugfix:** Lernblöcke 18:00 in `settings.timezone` statt UTC (`app/learning/blocks.py`).
- Logging: Originalfehler in `study_api.py:308` protokollieren; Snapshot-Backoff in `app/host/lease.py:288`.

### 4 · Tests und Frontend-Qualität
- E2E-Isolation: frische Fake-Datenbank pro Spec oder globaler Reset-Endpunkt; ungeklärten 409 in `material.spec.ts` damit erneut prüfen.
- Coverage-Schwelle 80 % (`pytest-cov`, `fail_under`), `mypy` auch für `tests/` (6 Fehler in `tests/fake_servers/phase1_app.py`).
- Vitest für `localDate()`, PDF-Trefferzählung, Offline-Warteschlange.
- Gemeinsamer `useMutation`-Wrapper statt ~20 handgeschriebener busy/try/finally-Blöcke; stille Fehler zeigen (`CommandPalette.tsx:66`, `StudyBlocksPanel.tsx`).
- `MaterialPage.tsx` (694 Zeilen) in Viewer/Suche/Markierungen aufteilen; `SystemPage`, `ProjectsPage`, `AiPage` in Panels zerlegen.
- Weitere Seiten lazy laden (Hauptbundle 523 kB).
- Handgeschriebene API-Typen durch generierte ersetzen.
- Panel-Titel als semantische Überschriften (`frontend/src/components/State.tsx`).
- Defense-in-depth: DOMPurify für Kartentext in `StudyPage` (Backend bereinigt bereits).

### 5 · Lücken zum Bauauftrag
- CLI (§25): `search`, `deadlines`, `anki queue`, `ai export`, `cards import|export`, `setup`, `describe`.
- Fokus-Timer für die Lernblöcke des Tages (§24.6).

### 6 · Optionale Features
- **Demo-Modus** mit Fake-Daten (ohne Hochschule/Moodle ausprobierbar), liefert README-Screenshots.
- **i18n** Deutsch/Englisch komplett (siehe Entscheidungen).
- **Plugin-Vorlage** für Hochschul-Konnektoren (`CONNECTOR_PLUGINS`): Template, Anleitung, Beispiel.
- **Anthropic-Adapter** für `app/ai/adapter.py`, standardmäßig aus.
- **Lernblöcke gegen Kalender/Stundenplan** prüfen, keine Überschneidungen.
- **PWA-Share-Target:** Links und PDFs vom Handy in Schnellerfassung/Drop-Ordner teilen.
- **Themen zusammenführen** im Lernstand.
- **Kompletter Datenexport** als ZIP.

## Abschluss

Nach allen Paketen: vollständiger Lauf (pytest, Ruff, mypy, OpenAPI, Typecheck, ESLint, Vitest, Build, komplette Playwright-Suite, Lighthouse), `docs/PROGRESS.md` und `docs/MANUELL_TESTEN.md` aktualisieren, README (Deutsch und Englisch) mit Screenshots aus dem Demo-Modus.
