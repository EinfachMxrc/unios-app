<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Codebase- und Workflow-Audit vom 07.10.2026

Die größte belegte Schwäche außerhalb des PDF-Lesers war die Kopplung von
Notizverknüpfungen an den gerade sichtbaren Listenausschnitt. Eine normale Suche
oder das Wechseln der Listenseite konnte gültige Verknüpfungen im Dokument verschwinden
lassen. Dieses Problem und die wiederholten globalen Titelabfragen beim Speichern
sind inzwischen behoben und gezielt geprüft. Die Bereinigung unten entfernt
nachgewiesene Altquellen; weitere Befunde bleiben priorisierte Folgepakete.

## Umfang und Beweisgrenzen

Geprüft wurden die Laufzeitverdrahtung, Importpfade und ausgewählte Implementierungen
im Frontend, Backend und Desktop sowie CLI-/Plugin-/Prüfwerkzeugreferenzen. Der
Bestand umfasst 367 Python-Dateien unter `app/`, 63 Domänenpakete, 45 direkte
React-Seitendateien unter `frontend/src/pages/` und sechs Rust-Dateien im
Desktop-Laufzeitordner. Der Bereichskatalog enthält 37 Hauptbereiche und sechs
Detailrouten; Onboarding, Einrichtung und Import kommen separat hinzu.

Ein Literal-Importgraph ab `frontend/src/main.tsx` berücksichtigte statische Imports,
`import(...)`, CSS-Imports und CSS-`@import`. Im ersten Snapshot waren 313 von 387
TS-/TSX-/CSS-Quellen erreichbar. Nicht literal erreichbare Locale-Dateien werden
über Globs geladen; drei i18n-Helfer gehören zu Tests und Prüfscripts. Diese sind
kein Dead Code. Parallel neu angelegte Reader-Komponenten wurden ausdrücklich
nicht anhand dieses Zwischenstands als ungenutzt bewertet.

Der statische Audit las keine `data/`-, `local/`- oder `.env`-Inhalte und keinen
Schlüsselbund. Persönliche Studieninhalte wurden nicht ausgewertet. Bei der
abschließenden QA-Prüfung wurde erkannt, dass Python-Testimporte ohne
`UNIOS_FACTORY_ONLY=true` zusätzlich den globalen App-Bootstrap auslösen können.
Für diese vorherigen Importe ist vollständige Konfigurationsisolation daher nicht
belegt; weitere Testläufe deaktivieren diesen Bootstrap ausdrücklich und verwenden
synthetische Settings mit `_env_file=None` und eigenen frischen Verzeichnissen.
Keine Anmeldung bei Hochschulsystemen, kein Deployment und keine Datenmigration.
Die Importprüfung ist kein Beweis, dass alle Benutzerabläufe korrekt sind. Im
ersten Audit wurden keine Builds, vollständigen Tests oder Browserläufe gestartet.
Im abschließenden isolierten Notiz-/Paarungslauf mit `UNIOS_FACTORY_ONLY=true`
sind 33 Backend-Tests und 17 Frontend-Tests grün, dazu Typecheck, gezieltes
ESLint/Ruff/Mypy und beide API-Vertragsprüfungen. Diese fokussierten Ergebnisse
ersetzen keine Prüfung sämtlicher Domänen.
Die neue Browserregression `frontend/e2e/note-link-catalog.spec.ts` ist angelegt;
ihre Ausführung und die Build-Abnahme gehören zur gemeinsamen Übernahmeprüfung.

## Sofort löschen / aufräumen

Die folgenden Dateien waren weder über den Laufzeit-Importgraph erreichbar noch
von aktiven Prüfscripts oder Packaging-Code konsumiert. Weitere Fundstellen waren
historische Dokumentation, Herkunftskommentare in der bereits zusammengeführten
CSS-Datei und ein alter Kommentar in einem Browser-Test. Alle sieben Dateien sind
entfernt; Git bewahrt ihre Historie.

| Entfernte Quelle | Zeilen | UTF-8-Bytes |
| --- | ---: | ---: |
| `frontend/src/App.css` | 1.479 | 29.491 |
| `frontend/src/workspace.css` | 223 | 12.967 |
| `frontend/src/overhaul.css` | 434 | 23.942 |
| `frontend/src/unios-workspace.css` | 1.674 | 33.792 |
| `frontend/src/Quality.css` | 57 | 4.225 |
| `frontend/src/components/Shell.css` | 117 | 3.460 |
| `frontend/src/components/navigation.ts` | 27 | 1.127 |
| **Gesamt** | **4.011** | **109.004** |

Die vier Exports des alten Navigationshelfers hatten keine Aufrufer; der aktive
Bereichskatalog ist `components/sidebarCatalog.ts`. `DESIGN.md`, `DESIGN_SYSTEM.md`
und `UI_PRINCIPLES.md` verweisen jetzt auf die aktiven Styles. Die Bereinigung
verringert Quellenballast und widersprüchliche Pflegepfade. Die entfernten Dateien
waren bereits nicht gebündelt; eine Verringerung des ausgelieferten Bundles folgt
daraus nicht.

Weitere Konsolidierung ist nötig: `styles/workspace-layout.css` enthielt im ersten
Snapshot 3.241 Zeilen und 160 mehrfach deklarierte Selektoren. Herkunftsabschnitte
zeigen, dass ältere Styles größtenteils verkettet wurden. `.content` kam elfmal,
`.notes-layout` siebenmal vor. Diese Zählung enthält legitime Media-Regeln und ist
kein Beweis, dass jede frühere Deklaration ersatzlos entfallen kann. Komponentenweise
vereinheitlichen und danach Hell/Dunkel, Desktop/390 px sowie Lade-Reihenfolge prüfen.
Der parallel bearbeitete Reader verschiebt seine Regeln in sein eigenes Stylesheet.

## UI/UX-Kritik und Redesign

### P1 behoben: Ein Listenfilter veränderte die Funktionsfähigkeit des Dokuments

**Nutzer-Pain-Point:** Eine Studentin öffnet eine verknüpfte Notiz, sucht links nach
einem anderen Titel und sieht plötzlich `[[Zielnotiz]]` als unaufgelösten Text.
Beim Bestand über 50 Notizen kann derselbe Link je nach Listenseite funktionieren
oder fehlen. Selbst identische Titel können fälschlich eindeutig wirken, wenn
nur eines der beiden Ziele auf der aktuellen Seite sichtbar ist.

**Beleg im ersten Snapshot:** `pages/NotesPage.tsx:179` reicht nur `data.notes` an `NoteDocument` weiter.
`app/web/api.py:397` begrenzt diese Liste standardmäßig auf 50. `editor/extensions.tsx:59`
bestimmt Auflösung und Eindeutigkeit allein mit `notes.filter`. `NoteStudio.tsx:192`
deaktiviert die vorhandene Remote-Entity-Suche für Notizen; Zeilen 196/206 und
`NoteMarkdownEditor.tsx:49` suchen ebenfalls im Listenausschnitt. Die Backend-
Auflösung in `app/notes/wikilinks.py:20` betrachtet dagegen alle Notizen. Die UI
trimmt Titel nicht; das Backend nutzt `strip().casefold()`.

**Komponenten-Logik und umgesetztes Paket:** Der Listenindex bleibt paginiert und
ist von der Verknüpfungsauflösung getrennt. Beide Editoransichten und der
Einfügedialog nutzen `/api/entities/note?q=...&limit=40`. Wikilinks verwenden
`GET /api/notes/link-targets?titles=...&titles=...`, begrenzt auf 32 Titel je Batch
und 200 Zeichen je Titel. Ein Service normalisiert mit `strip().casefold()`;
ein Repository projiziert einmal ID, Titel und Kurs, keine Dokumentkörper. Pro
Titel unterscheidet die Antwort eindeutig, mehrdeutig und fehlend. Der Editor- und
Reader-Provider teilen das Ergebnis und einen bewusst offlinefähigen Cache.
Frontend-Batches begrenzen auch die kodierte URL-Länge. Lokale Änderungen und
abgeschlossene Synchronisierung aktualisieren die Metadaten; ein Listensprung
initialisiert den Editor nicht erneut und verändert weder Cursor noch Inhalt.
Vier zentrale Requestslots verhindern einen gleichzeitigen Anfragesturm; wartende
Batches werden beim Verlassen abgebrochen. Ein 100.000-Zeichen-Dokument mit 487
verschiedenen Unicode-Titeln prüft Queuefortschritt und höchstens vier laufende
Requests. Bei neuen Offline-Verknüpfungen erhalten geänderte Batch-URLs die
vorherigen globalen Antworten je unverändertem Titel; die jüngste Cacheantwort
entscheidet auch bei zuvor bekannter Mehrdeutigkeit. Tokenizer und Batch-Parser
verwenden dieselbe Grammatik und zählen bis 200 Unicode-Codepoints statt UTF-16-
Einheiten. Leere, verschachtelte und zu lange Tokens bleiben normaler Text.
Die vorhandene Entity-Suche allein beweist keine Eindeutigkeit: sie ist eine
begrenzte Enthält-Suche mit maximal 100 Zeichen, Notiztitel erlauben 200.

**Gezielt verifiziert:** Reale synthetische 53 Notizen mit Ziel außerhalb Seite
eins, globale Duplikate in zwei Kursen einschließlich eines gleichnamigen
Quelldokuments, 200 Zeichen, Leerzeichen und Unicode-Groß-/Kleinschreibung,
Umbenennen, verspätet angelegte Ziele und unveränderte Pagination. Vitest prüft
den stabilen Dokument-DOM beim Listenwechsel, Remote-Vorschläge unabhängig vom
Listenausschnitt, Mehrdeutigkeit sowie verfügbaren und fehlenden Offline-Cache.
Die Browser-Spec ergänzt Paging, Filter, Bearbeiten und Sync-Aktualisierung.
Noch offen ist die Browser-Ausführung dieses Pakets; ein Unit-Test beweist keinen
nativ unveränderten Trackpad- oder Cursorablauf auf macOS.

### P1 behoben: Ein Quellenlink öffnete einen zweiten Browserkontext

**Nutzer-Pain-Point:** Ein Klick auf die Quellenstelle einer PDF-Lernnotiz verließ
den laufenden Arbeitsbereich, weil die Markdown-Link-Extension `_blank` verwendet.
Im Desktop-Webview erschwerte das die Rückkehr zum geöffneten Lernkontext.

**Umsetzung und Abnahme:** `editor/RichNoteDocument.tsx` öffnet beim normalen
Linksklick erlaubte relative UniOS-Routen über React Router im bestehenden
Workspace. `lib/noteLinks.ts` prüft den tatsächlichen `href`-Attributwert und
verwirft fremde Hosts, Schema-URLs, Backslashes und Kontrollzeichen. Externe
Links und Modifier-Klicks behalten das Browser-Verhalten; der Schreibmodus bleibt
unverändert. Ein fokussierter Router-Test prüft `/material/51?page=120` und
Strg-Klick; der Reader-Browserablauf prüft die Quellenrückkehr separat.

### P2: Zwei Seitenpanels zeigen teilweise dieselbe Beziehung

**Nutzer-Pain-Point:** Im Notizdetail stehen dieselben eingehenden Wikilinks unter
„Referenzen“ und „Verknüpfungen“. Unterschiede zwischen Erwähnung, Empfehlung und
manuell gesetzter Beziehung bleiben schwer erkennbar.

**Beleg:** `NoteDocument.tsx:487-488` rendert `NoteReferences` und `LinkedItems`
nebeneinander. `app/links/service.py:103` liefert ausdrücklich auch `wikilink`-
Beziehungen; `app/notes/references_api.py:83` lädt dieselben eingehenden Kanten.

Die Dopplung führt zusätzlich zu einem widersprüchlichen Schreibvorgang:
`LinkedItems.tsx:118` bietet „Trennen“ auch für automatische Wikilinks.
`app/links/service.py:158` entfernt nur die Kante; der Dokumenttext bleibt
`[[Ziel]]`. Ein synthetischer Service-Reproducer bestätigt: nach dem Trennen ist
die Kante weg, der Dokumentlink bleibt aktiv, nach einer gewöhnlichen Textänderung
entsteht die Kante erneut. `NoteReferences` und `LinkedItems` laden nach Aktionen
außerdem jeweils nur ihre eigene Abfrage neu. Das Notiz-`onSaved` aktualisiert den
Listenindex, nicht die zweite Beziehungsfläche.

**Umsetzung:** Eine gemeinsame Objekt-Seitenfläche mit Abschnitten „Verknüpft“,
„Erwähnt“ und „Vorgeschlagen“, eindeutigen Richtungen und einer Zielkarte je
Beziehung. Datenanbieter bleiben nach semantischem Zweck getrennt; die Darstellung
dedupliziert Kanten. Mobil als beschrifteter Detail-Drawer mit Fokus-Rückkehr.
Automatische Wikilinks erhalten „In der Quellnotiz bearbeiten“ statt eines
Kanten-Löschbuttons; manuelle Beziehungen behalten „Trennen“. Der Backend-Service
muss automatisches Unlink ebenfalls ablehnen oder den Quelltext revisionssicher
ändern. Nach einer tatsächlichen Verknüpfungsänderung werden beide betroffenen
Objektflächen gemeinsam invalidiert. Dazu Regressionen für ausgehende und
eingehende Links, Trennen, erneutes Speichern und den unveränderten Quelltext.

### P2: Codebeispiele zählen als echte Rückverweise

**Nutzer-Pain-Point und Beleg:** Eine Anleitung zur Syntax enthält ausschließlich
einen Markdown-Codeblock mit `[[Ziel]]`; das Ziel erhält trotzdem einen Backlink.
Der synthetische Reproducer bestätigt diesen Fall. `_sync_source` in
`app/notes/wikilinks.py:20` durchsucht Rohtext, während der Markdown-Reader den
Inhalt als Code darstellt. Die Erwähnungssuche schützt Codeblöcke bereits, die
automatische Kantenpflege nicht.

**Umsetzung:** Dieselbe Inline-Syntax für sichtbare Wikilinks definieren und bei
der Kantenpflege Codeblöcke, Inline-Code sowie escaped Text ausnehmen. Vor einer
Migration bestehender Kanten den exakten Markdown-Vertrag und Backtick-/Tilde-
Grenzfälle testen. Dieses vorhandene semantische Problem ist nicht Teil der
jetzt abgeschlossenen globalen Titelauflösung und wurde hier nicht verändert.

### P2 umgesetzt im Quellcode: native Kontextmenüs wieder zugelassen

**Nutzer-Pain-Point:** Rechtsklick auf Dokumenttext, Eingabefelder und Links bietet
weder native Kopier-/Einfügeaktionen noch die gewohnten Textwerkzeuge des Systems.

**Ausgangsbeleg:** `desktop/src-tauri/src/main.rs` registrierte ein globales
`contextmenu` mit `preventDefault()`, ohne Zielprüfung. Diese Registrierung wurde
im Reader-Paket `cc3f422` entfernt.

**Verbleibende Abnahme:** macOS-Webview und Windows-Webview jeweils
mit Texteingabe, PDF-Auswahl und einem Link prüfen. Eine Windows-Browserprüfung
beweist weder native MacBook-Gesten noch das Webview-Kontextmenü.

## Workflow- und Feature-Lücken

| Gruppe / vollständige Bereichsinventur | Vorhandene Verdrahtung | Konkrete Reibung oder nächste Prüfung |
| --- | --- | --- |
| Heute, Kurse, Materialdetail, Hochschulunterlagen, Suche | Kurs-/Materialkatalog, Textextraktion, FTS, Offline-Index, versionsbezogene Leserlinks | 120-Seiten-Szenario mit Auswahl → Quelle → Notiz → Wiederholung prüfen; globale Suche benötigt Formularabsenden (`SearchPage.tsx:85`), Palette sucht bereits nach 250 ms (`CommandPalette.tsx:86`) |
| Notizen, Schnellerfassung, Eingang, eigene Dateien, Sprachnotizen, Studientage | Markdown/Rich-Editor, globale Wikilink-Metadaten, lokale Entwürfe, Revisionen, Konfliktauflösung, Capture-Outbox, Intake, Medien | Katalogfehler gezielt behoben; Vorlesungsnotiz aus konkreter Kalenderveranstaltung fehlt laut `ENTRY_BARRIERS.md`; Notizen und Jots nicht als doppelte Domäne ersatzlos streichen |
| Sammlungen | Liste, Tabelle, Karten, Board, Kalender und gespeicherte Filter | Ergebnisgrenze 200 erst nach vollständiger Berechnung; kein Server-Paging. Monatssprünge können an längst abgeschnittenen Ergebnissen vorbeilaufen |
| Lernen, Karten, Lernsession, Übungen, Coding, Analysen, Wochenübersicht | Active Recall, Anki/FSRS, Reviews, deterministische Assessments, Coding-Sandbox, Lernfortschritt, Blöcke und Zyklen | Funktionen existieren; Kontextwechsel zwischen Quelle, Prüfung und Lernplan verkürzen. Eine gemeinsame Prüfungszentrale bleibt ein eigenes Paket |
| Projekte und Projektdetail | GitHub-/Repo-Spiegel, Assignments, persistente Projekt-Todos | Allgemeine eigene Aufgaben fehlen; nicht in schreibende Hochschule-Abgaben umdeuten (`ENTRY_BARRIERS.md`) |
| Termine, Noten, Mail, Mensa, Räume, Campus | Kalenderauswahl, bestätigte Portalfakten, Mailanbindung, Verpflegung und Raumsuche | Kalender-/Vorlesungsnotizbezug und Prüfungslernstoff-Zuordnung verbessern; reale Portalfelder nur nach belegten Fakten ändern |
| Regeln, Kartenvorschläge, Übungsvorschläge, Erklärungen, KI-Paket | Automationen, Freigaben, Vorschlagswarteschlangen, Budgetschutz, optionaler Adapter und MCP | Bestehende deterministische Abläufe erhalten. Vorschlag und tatsächlich bestätigtes Wissen sprachlich und visuell unterscheidbar halten |
| Erweiterungen, Erweiterungsdetail, Marketplace, Jobs | Registry, isolierte Laufzeit, Hintergrundjobs | Optionale Features sind über Routen und Registry erreichbar; fehlender statischer Import beweist keine ungenutzte Erweiterung |
| Benachrichtigungen, Aktivität, System, Einstellungen, Mehr | gemeinsamer Bereichskatalog, Gesehen-Stand, Modulschalter, Diagnose, Datenexport, Wiederherstellung | Hauptnavigation ist begrenzt, aber 37 Bereiche benötigen konsistente Objekt-Aktionen statt weiterer unabhängiger Bedienflächen |
| Onboarding, Einrichtung, Import und native Clients | Recovery-/Demo-Gates, Gerätekopplung, Sidecar, signierte Updateprüfung, MCP-/Anki-/Login-Clients | Start/Update im echten Mac-Webview und auf frischen Geräten separat prüfen; keine Änderung der bestehenden VPS-Bindung aus UI-Redesign ableiten |

Die vorhandenen Links, Markdown-Shortcuts, Anki-Lernsessions und Active-Recall-
Werkzeuge sind keine fehlenden Features. Ein freier Canvas-/Mindmap-Arbeitsbereich
ist nicht verdrahtet; CSS-Klassen mit `canvas` bezeichnen lediglich die Notizfläche.
Die Note-Studio-Extension-Liste enthält keine Mathematik-Extension oder LaTeX-
Darstellung (`editor/extensions.tsx:299`). Die mathematische Assessment-Engine
erfüllt diese Anforderung im Notizeditor nicht.

Neue Lernfeatures sollten auf bestehender Provenienz aufbauen: eine PDF-Stelle als
Quelle einer Karte/Frage speichern; Seitenhandle und Quellhash sichtbar zurückführen;
Canvas-Knoten an stabile Objekt-IDs binden; mathematische Eingabe verlustfrei im
Markdown belassen. Ein Canvas ohne echte Links oder Karten ohne Quelle würden
zusätzliche Ablagearbeit erzeugen.

## Konkrete Architektur- und Performancepakete

1. **Wikilink-Auflösung und Notizkatalog umgesetzt:** P1 oben ist mit Backend-/Frontend-
   Regressionen behoben. Bestehende Kanten, Textformat und Revisionen bleiben erhalten;
   der Browserfall mit 53 Notizen, Filter/Paging, Unicode, Mehrdeutigkeit und
   Umbenennungen bestand. Der Gesamtstand wird separat integriert.
2. **Quadratische Titelabfragen behoben; Körperauswahl bleibt ein Folgepaket:**
   `refresh_incoming_wikilinks` fragte im ersten Snapshot pro Quelle erneut alle
   Notes ab. Jetzt teilen Speichern und eingehende Aktualisierung dieselbe
   ID-/Titelprojektion. Bestehende Wikilink-Kanten werden einmal gruppiert statt je
   Quelle geladen. Der Queryzähltest mit einer und 80 Quellen belegt jeweils genau
   drei SELECTs beim eigenständigen Refresh und eine Titelprojektion je Anlegen-
   Transaktion. Die Verarbeitung wächst mit Metadaten, Kanten und Quelltext statt
   mit wiederholten Kreuzprodukten der Notizanzahl. FTS-Körper mit Wikilinks werden
   weiterhin vollständig gelesen; auch `references_api.py` liest alle aktuellen
   FTS-Körper, bevor Ergebnisse auf 50 begrenzt werden. Eine gezielte Kandidaten-
   abfrage mit exakter Nachprüfung bleibt nötig. Der dortige Mehrdeutigkeitscheck
   benutzt jetzt dieselbe globale Normalisierung und eine schmale Titelprojektion.
3. **Sammlungen:** `_results(..., limit=200)` in `collections/service.py:65` lädt
   sämtliche Quelldaten; gemischte Sammlungen rufen Kinder sogar mit `limit=None`
   auf (`:80`), Metadaten werden vollständig geladen (`:151`). SQL-Filter, Cursor-
   Paging und aggregierte Totals einführen, Kalender nach Monatsintervall abfragen.
   Für Fortschritt und Abgabestatus Fachregeln erhalten, nicht bloß früher kürzen.
4. **API/Service/Repository schrittweise trennen:** 28 API-Dateien enthalten noch
   direkte `factory()`-Sessionblöcke. Beispielsweise validiert und speichert
   `journal/api.py:163-200` Revisionen direkt in HTTP-Routen. Erst bei konkreter
   Domänenänderung die Fachtransaktion in den Service, Datenzugriffe ins Repository
   verschieben. Breite mechanische Wrapper erhöhen nur die Zahl der Dateien.
5. **Bundle-/Offline-Grenzen umgesetzt:** `scripts/check-bundle-budget.mjs`
   prüft zusätzlich NotesPage, Monaco/Sprachmodule/Worker und die deduplizierte
   PWA-Precache-Nutzlast. Alle Grenzen bestanden am neuen Produktionsbuild.
   Workbox cached auch `.mjs`, `.woff` und `.ttf`; ein kalter Home-only-Browserfall
   konnte PDF-Worker und Editor-Schriften offline abrufen, bevor Reader/Editor
   geöffnet wurden. Ungeöffnete Inhaltsdateien werden damit nicht zugesichert.
   Das Note-/Coding-Loading bleibt lazy; entfernte, bereits unimportierte Alt-CSS
   erzeugen keine behauptete Bundle-Ersparnis. Messwerte stehen in PROGRESS.
6. **Reader und Cmd+K umgesetzt:** Nicht modaler Desktop-Split, Quellenentwürfe,
   verdeckter Abruf, verankerte Gesten und auswahlstabile Render-Ebenen sind mit
   dem synthetischen 120-Seiten-Szenario geprüft. Cmd+K berücksichtigt alle sieben
   Suchtypen und verwirft überholte Antworten. 21 fokussierte Browserfälle grün;
   native Hardware und die umfassende Einzelprüfung bleiben offen. Design und
   Quellenentscheidungen stehen in `READER_STUDY_WORKSPACE.md` und
   `READER_OPEN_SOURCE_BENCHMARK.md`.

Die Liste ist ein belegter Einstieg in das gesamte Mandat. Noch offen sind die
vollständige funktionale Einzelprüfung aller Features, eine aktuelle visuelle
Abnahme aller Hauptansichten, Großbestandsmessungen und echte native MacBook-
Gestentests. Ein routenweiter Importgraph oder ein grüner Einzeltest erfüllt
diese Gesamtanforderungen nicht.
