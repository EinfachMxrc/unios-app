<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Angenommenen Lernauftrag tatsächlich bearbeiten

## 1. Sofort löschen / aufräumen

Die bisherige Trennung zwischen Planung und globalen Lernübersichten zwang
Nutzer, Kurs, Quelle, Seite und eigene Antwort beim Wechsel erneut zusammenzusuchen.
Der neue Arbeitsbereich verwendet die vorhandenen Datensätze und Komponenten:
`MaterialReader`, `ReaderStudyTools`, `NoteDocument`, `PracticePanel` und die
native Anki-Sitzung. Es gibt keinen zweiten Reader, Editor, Scheduler,
Übungsdatenbestand oder freien Rücksprung-URL-Mechanismus und keine neue Bibliothek.

Die Lese-SQL aus `app/learning/practice.py` liegt jetzt in Repository/Service/Schema.
Kursfilter werden vor dem 200er-/100er-Fenster angewendet. Versuchszahlen und letzte
Ergebnisse werden gemeinsam geladen; einzelne SQL-Abfragen pro Aufgabe entfallen.
Der Timer besitzt eine
gemeinsame Zustandquelle unter seinem bestehenden Speicherschlüssel; lokale
duplizierte Lade-/Speicherlogik entfällt. Die bestätigte Runtime-Art wird aus dem
Start-Gate weitergereicht, statt im normalen Webbetrieb einen fehlenden
Client-Endpunkt zu prüfen. Eine ausdrückliche Restore-Schranke hält Hintergrund-
schreiber bis zum Laden des Offline-Speichers ungemountet.
Der lokale Client-Status wird auch bei ausgeschaltetem Browser-Online-Status
abgefragt. Ein frisches Offlinefenster bleibt dadurch nicht im Ladezustand;
bei unerreichbarem Status bleiben vorhandene Inhalte lesbar und Writes gesperrt.

## 2. UI/UX-Kritik & Redesign

Szenario: Ein Student nimmt einen 35-Minuten-Block zu Grenzwerten an, liest Seite
12 eines 120-seitigen Skripts, formuliert eine Erklärung, übt und wiederholt eine
eigene Quellenkarte. Ein globaler Kartenstart allein hilft ihm bei diesem Auftrag
nicht. Die Lernübersicht und angenommene Blöcke/Zyklen besitzen deshalb „Jetzt
lernen“ mit stabiler Block-/Cycle-ID.

Der Arbeitsbereich zeigt den tatsächlichen Kurs, Themen und gespeicherten
Prüfungstermin. Fehlender Termin, entfernte Themen und geänderter Prüfungszeitpunkt
bleiben ausdrücklich erkennbar. Vier erreichbare Arbeitsmodi führen zu Quelle
und Mitschrift, Kursnotizen, Kurskarten und Kursübungen. Hauptaktionen benennen
ihr Ziel: „Kurskarten lernen“ bzw. „Zur Quellenarbeit“. Der vorhandene Blocktimer
liegt in einem aufklappbaren Bereich.

Die Modusleiste bleibt beim langen Lesen sichtbar. Ihre gemessene Höhe bestimmt
den Abstand der eingebetteten PDF-Werkzeuge, des Mitschriftpanels und der
Seitensprünge; die mobile Leiste darf umbrechen. Ein Scroll zum Kopf überschreibt
keine PDF-Position, solange keine Quellenseite an der Leselinie steht. Passive
Seitenmeldungen ersetzen nur die Seitenzahl in derselben gültigen Fokusroute und
erhalten Scroll/Fokus. Normale Quellen-, Notiz- und Moduswechsel behalten ihre
Navigation. Desktop nutzt den vorhandenen Split, mobil den vorhandenen Radix-Dialog.

Die Bildprüfung fand außerdem eine echte Layoutkollision im vorhandenen
Übungspanel: Eine allgemeine Flex-Zeile drängte Frage und Antwort auf 390 px in
schmale Spalten und verschob den Panelkopf. Das Übungselement erhält einen
eigenen vertikalen Inhaltsfluss. Frage, Quellenangabe und Antwort folgen der
Lesereihenfolge; die Antwort nutzt die verfügbare Breite. Die Browserprüfung
misst zusätzlich die tatsächlichen Inhaltsbreiten und sichtbaren Panelgrenzen.

## 3. Workflow- & Feature-Lücken

Ein begonnenes Übungsergebnis und eine Mitschrift überleben den Moduswechsel.
Quellennotizen öffnen nach dem Speichern denselben Auftrag mit der echten
Notiz-ID. Eine eingefrorene Kartenquelle öffnet die ursprüngliche PDF-Version
und Seite. Eine aufgedeckte native Kartensitzung bleibt bei Navigation/Zurück
erhalten; ein harter Reload erfordert ein erneutes bewusstes Aufdecken.
Bereits online geöffnete Fokusmetadaten sind eng begrenzt offline verfügbar.

Kursquellen und Kursnotizen nutzen die vorhandene Pagination; direkt angeforderte
ältere Versionen/Notizen werden anhand ihrer echten Kurs-ID geprüft. Fremde
Notizen werden vor dem Editor-Mount, fremde Quellen vor dem PDF-Dateiladen und
Reader-Render abgewiesen. Übungen ohne ersten Versuch bleiben durch LEFT JOIN
sichtbar. Der Browserfall stellt eine eigene ältere Aufgabe neben 201 neueren
Fremdkurs-Aufgaben.

Native Kartenstapel werden über GUID/UniOSId und gespeicherte Herkunft zugeordnet,
niemals über ähnliche Kursnamen. Eine Kursumbenennung verliert den Stapel nicht.
Die Sitzung verwendet die bestehende native Deck-Queue einschließlich Unterstapeln;
zusätzliche Karten und unklare Zuordnungen werden ehrlich bezeichnet. Materialien,
Notizen und Übungen sind kursbezogen: Eine vollständige Themenzuordnung ist noch
nicht vorhanden. Eine themengenau gefilterte Deck-Queue oder ein Canvas mit
mehreren gleichzeitig verknüpften Quellen bleiben eigene Folgepakete.

Der nächste belegte Lernbruch betrifft eine bereits gespeicherte Mitschrift:
Der jetzige Quellen-Split führt einen Neuentwurf; die gespeicherte Notiz öffnet
im separaten Notizmodus. Beim weiteren Exzerpieren muss der Student deshalb
zwischen Quelle und bestehender Zusammenfassung wechseln. Das Folgepaket hält
dieselbe Synthesenotiz rechts geöffnet, während links genau ein Reader oder
eine Referenznotiz wechselt. Es verwendet die vorhandene Notiz-UUID im Fokuszustand,
einen gemeinsamen `NoteDocument`-Controller und den bestehenden Save-/Merge-Pfad
mit `expected_revision`. Zitate behalten die angezeigte Version und Seite.

Eine spätere Beziehungskarte kann vorhandene `LinkEdge`-Nachbarn darstellen.
Material-Beziehungen führen derzeit zur neuesten Version und ersetzen deshalb
keine eingefrorenen Seitenzitate. Vor mehreren gleichzeitigen Readern müssen
globale Seiten-Selektoren und DOM-IDs instanzbezogen werden. Die bestehende
24er-Kandidatensuche kann Notiztreffer hinter anderen Objekttypen verdrängen;
Rückverweise enden ohne Pagination bei 50. Diese konkreten Grenzen sind noch
nicht Teil dieses Pakets. Die nächste Auswahl soll die vorhandenen paginierten
Kurs-/Notizkataloge nutzen und ihren tatsächlichen Suchumfang benennen.

## 4. Konkrete Umsetzung

- Route: `/learning/focus/:kind/:id`; API: `/api/learning/focus/{kind}/{id}`.
  Nur angenommene Blöcke/Zyklen; exakte Prüfung → Kurs → Themen-Kette.
- API-Schichten: `app/learning/focus_{api,service,repository,schema}.py` und
  `practice_{service,repository,schema}.py`. DTOs liegen im exportierten OpenAPI
  und den generierten Frontendtypen. Keine Schema- oder Bestandsmigration.
- UI: `frontend/src/pages/FocusWorkspacePage.{tsx,css}`,
  `components/LearningFocusBar.{tsx,css}`, `lib/learningFocus.ts`,
  `lib/focusTimerState.ts` und die vorhandenen Reader-/Notiz-/Lernkomponenten.
- Kontext-GET verwendet das offizielle Anki-SDK ohne FSRS-Normalisierung; der
  echte SDK-Test beweist unveränderte Auswahl, Einstellungen, Karten, Notizen,
  Reviewlog und SQL-Bindungen. Der Fokus-Timer lädt den bereits bestätigten
  Block direkt, statt über die globale Planungsabfrage neue Vorschläge anzulegen.
- Hauptabläufe: `frontend/e2e/focus-workspace.spec.ts`; Startup/Pairing:
  `components/ServerConnection.mode.test.tsx` und `e2e/server-client.spec.ts`.
- Visuelle Abnahme: `scripts/audit_focus_workspace.mjs --fake-data`, ausschließlich
  temporäre synthetische Profile, eigene Ports 8194/4194. Die zusätzliche
  Origin-Freigabe gilt allein für diesen explizit bezeichneten Fakeprozess.

Die Muster folgen den verknüpften Ansichten von
[Obsidian Tabs](https://obsidian.md/help/tabs), gemeinsamen referenzierten Blöcken
im [offiziellen Logseq-Tutorial](https://github.com/logseq/docs/blob/master/pages/tutorial.md)
und einem gemeinsamen Datenbestand wie im
[tldraw Store](https://tldraw.dev/sdk-features/store). Übernommen wurden die
Kompositions- und Zustandsprinzipien; es wurde kein externer Quellcode kopiert.

Die getrennte historische KI-Review-Reparatur liegt in
`../legacy-review-recovery-20261007/README.md` und Commit `b8a118f`.

## Abnahme und Grenzen

Der Backend-Stand besteht 1015 Pythonfälle bei zwölf erwarteten Skips in
1000,70 Sekunden; 172 echte Testdateien wurden genau einmal gesammelt.
Ruff prüft 682 Pythondateien; Mypy prüft 564 Quellen ohne Fehler.
Alle 672 Frontendfälle in 75 Dateien bestehen in 10,68 Sekunden; vollständiges
ESLint, TypeScript-Build, i18n für 61 Namespaces, OpenAPI/Typen, SPDX und
Bundle-/PWA-Grenzen sind grün. Der gezielte Browserlauf besteht 15 Szenarien
in 28,52 Sekunden, einschließlich mobiler Übungsgeometrie, Offline-Neuladen,
Raumabläufen und nativer Kopplung.

Zwei vorherige monolithische Diagnoseversuche waren nicht erfolgreich:
317 bestandene Fälle plus ein Asset-Ausfall am früheren Layoutstand und
318 bestandene Fälle plus ein Asset-Ausfall am finalen Build. Beide initialen
JavaScript-Anfragen meldeten `net::ERR_NO_BUFFER_SPACE`; die konkrete Ursache
auf OS-/Netzwerkebene ist nicht bewiesen. Die
[Chromium-Fehlerdefinition](https://chromium.googlesource.com/chromium/src/+/HEAD/net/base/net_error_list.h)
bezeichnet fehlenden Socketpuffer. Der Build besitzt 66 Modulepreloads, darunter
61 deutsche Sprachmodule; die Bildabnahme erfasst maximal 70 gleichzeitig
ausstehende Seitenrequests. Das ist kein Nachweis über 70 Sockets. Workbox
installiert die 239 eindeutigen Precache-Dateien in der eingesetzten Version
[sequentiell](https://github.com/GoogleChrome/workbox/blob/v7.4.1/packages/workbox-precaching/src/PrecacheController.ts).
Systemweite Netzwerkeinstellungen wurden nicht geändert.

Die Galerieprüfung adressiert ausdrücklich den Shell-Seitenkopf
`.content > .page-heading > h1`: Ihre selbst angelegte Notiz enthält zusätzlich
eine legitime Markdown-H1. Die alte globale Abfrage war dadurch mehrdeutig.
Sichtbarkeitsprüfung, Timeouts und Retryzahl bleiben unverändert.

Der finale Vollumfang besteht 319 Szenarien in vier frischen, sequentiellen
Browserdurchläufen mit 80/82/85/72 Fällen in zusammen 654,17 Sekunden.
Der korrigierte dritte Durchlauf wurde vollständig wiederholt. Keine
unerwarteten Ergebnisse, Skips, flakigen Erfolge oder konfigurierten Retries.
Der ID-Abgleich gegen den ursprünglichen Gesamtumfang bestätigt alle 319
Test-IDs exakt einmal. Der Produktbuild blieb während aller finalen Durchläufe
identisch. Nach der Browserabnahme wurden 19 regenerierte historische Bilder
aus der vorab geprüften Sicherung wiederhergestellt; alle 204 historischen
QA-Originale stimmen mit ihren ursprünglichen SHA256-Hashes überein.

16 tatsächliche Hell-/Dunkel-/Desktop-/Mobilzustände erreichen Lighthouse 100.
Alle 354 numerischen Detailaudits einschließlich Gewicht null bestehen; alle
16 Originalbilder wurden selbst gelesen. URL, Pager und echte PDF-Seite 12,
die 120 virtuellen Seitenslots, sichtbare Panelgrenzen und 316 px mobile Frage-
und Antwortbreite sind geprüft. Echte Tastatureingabe muss in den bestehenden
Entwurfsspeichern angekommen sein; Speicher-/Lösungsaktionen müssen bedienbar sein.

Der Nachweis enthält ausdrücklich 13 rohe CDP-Abbruchmeldungen und ihre Belege:
vier vollständig gelesene PDF-Streams, vier tatsächlich bestätigte 204-Opened-
Writes, vier bewusst ersetzte scoped Due-GETs und einen signalabgebrochenen
Notifications-GET mit vollständig erfolgreichem Nachfolger. Kein pauschaler
Abortfilter; unerklärte Abbrüche, HTTP-Fehler, Console-/Pageerrors, Warnungen und
Teardown-Abbrüche bleiben null. Der Diagnose-Observer liest nur Metadaten;
native Promise-/Response-/Reader-Rückgaben behalten ihre ursprüngliche Funktion.

Finaler Produktbuild: `5a5e62e97f5640d11d2b04e86ae91089b3f990d6a4bc717b325e3636d30505a4`.
Die endgültigen Browser-/Bildnachweise stehen in `validation-summary.json` und
`lighthouse-accessibility-summary.json` für diesen eingefrorenen Produktbuild.

Physische MacBook-/Safari-/native WebView-Gesten, signierte Installer und eine
Live-Anki-Desktop-Verbindung wurden hier nicht abgenommen. Die Docker-Engine war
bereits nicht erreichbar. Es gab keine privaten Datenmigrationen, keinen Push
und kein Deployment. Das umfassende Produktmandat bleibt aktiv.
