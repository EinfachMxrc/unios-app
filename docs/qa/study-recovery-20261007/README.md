<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Mehrfenster-Entwürfe und verlässlicher Lernfortschritt

Stand: 07.10.2026. Dieses Paket schließt die beiden im
[Quellenkarten-Review](../manual-source-cards-20261007/README.md) gefundenen
Zuverlässigkeitslücken. Ausschließlich synthetische Daten, echte temporäre
120-seitige PDFs und native Anki-Collections. Keine privaten Daten verwendet,
keine Migration eines echten Bestands, kein Push oder Deployment.

## 1. Sofort löschen / aufräumen

**Painpoint:** Eine Promise-Kette innerhalb eines Fensters schützt nicht vor
Schreibvorgängen eines zweiten Fensters. Derselbe Fehler betraf Kartenentwürfe
und die Offline-Bewertungsqueue. Ein gewöhnliches `get` → `set` konnte eigene
Texte oder eine während des HTTP-Requests hinzugekommene Bewertung entfernen.
Der bisherige reine In-Memory-Test teilte Arrayreferenzen und verdeckte den Fehler.

**Konzept:** Ein maßgeblicher, atomarer Speicher pro Aufgabe. Benachrichtigungen
beschleunigen die Darstellung; jede Änderung prüft den tatsächlichen Speicher.
Ein eigener Scheduler oder eine zweite persistente Bewertungsqueue ist unnötig.

**Umsetzung:** `manualDraftPersistence.ts` bündelt Entwurfszugriffe und
`manualDraftCoordination.ts` die Fenster-/Serverkoordination. Typen und Validierung
liegen in `manualDraftTypes.ts`. `studyQueue.ts` ersetzt getrenntes Lesen und
Schreiben durch `idb-keyval.update`: neue Bewertungen werden atomar angehängt,
Bestätigungen entfernen ausschließlich die betreffende UUID. Das bestehende
`pending-v1`-Format bleibt verwendbar. Tests verwenden unabhängige Modulinstanzen
und geklonte Datensätze; zwei zuvor rote Datenverlustfälle bestehen nach dem Fix.

Die alte `note_id`-basierte SQL-Bewertungslogik entfällt zugunsten eines gemeinsamen
Abgleichs für nativen Scheduler und Desktop-Agent. Fachregeln, Receipts und
SQL-Zugriffe sind getrennt. Keine neue Abhängigkeit oder fremder Quellcode.

## 2. UI/UX-Kritik & Redesign

**Simulation:** Ein Student liest Seite 12 seines 120-seitigen Skripts, schreibt
eine Frage und öffnet dieselbe Quelle später in einem zweiten Fenster. Ein
Hintergrundfenster verpasst sämtliche Broadcast-/Storage-/Fokusmeldungen. Beide
Fenster ändern ihre Frage und werden neu geladen. Der bisherige Browserablauf
verlor dabei die erste Frage; die Server-UUID konnte diesen lokalen Textverlust
nicht verhindern.

**Painpoint:** „Gespeichert“ war ohne gemeinsame Speicherprüfung zu optimistisch.
Ein unsichtbarer Konflikt kostet die eigene Formulierung und unterbricht Lernen.

**Konzept:** Der aktive Editor bleibt ruhig. Erst bei konkurrierender Änderung
erscheint „In einem anderen Fenster geändert“. Die eigene Fassung bleibt im
Editor; „Gesicherte Fassungen“ zeigt Frage, Antwort, Thema und Quellenseite als
lesbaren Text. „Aktuelle Fassung öffnen“ öffnet den gemeinsamen Stand. Eine Kopie
kann bewusst übernommen oder nach erfolgreicher Speicherung als weitere Karte
verwendet werden. Ein unklar bestätigter Request bleibt unverändert wiederholbar.
Die visuelle Prüfung zeigte beim Konfliktscroll eine verschwundene Quellenspalte
und eine leere linke Hälfte. Desktop hält deshalb die Quelle beim Scrollen sichtbar;
Mobil bleibt sie im normalen Lesefluss. Scrollbarer Inhalt und feste Aktionszeile
halten die Wiederherstellungsaktionen erreichbar.

**Komponentenlogik:** `ManualCardDialog` rendert den Entwurfszustand, Konfliktkopien
und gezielte Aktionen. Ein Envelope enthält eine monotone Revision, den gemeinsamen
Head, dauerhafte Kopien und unveränderliche Sendrequests. Jede IDB-Änderung vergleicht
die erwartete Head-Revision in derselben Readwrite-Transaktion. Ein veralteter
Schreibvorgang erhält eine eigene Kopie. Wiederholte Änderungen einer bestehenden
Kopie erhöhen ebenfalls die Envelope-Revision. Verspätete Bestätigungen aktualisieren
ihren Request, überschreiben aber keinen neu begonnenen Entwurf.

Bei bestätigtem `pushed` ist der Status monoton. Alte bereits gesendete v1-Kopien
erhalten „Diese Speicherantwort prüfen“ statt einer neuen UUID. Unlesbarer
maßgeblicher Speicher sperrt Änderungen und zeigt vorhandene Kopien konservativ
an. Der localStorage-Fallback benötigt echte Web Locks; eine ältere alternative
Kopie wird bei IDB-Ausfall nicht zur vermeintlich neuesten Fassung erklärt.

## 3. Workflow- & Feature-Lücken

**Simulation:** Der Student bewertet eine Karte, die native Anki-Engine bestätigt
sie, der SQL-Abgleich fällt danach aus. Er startet den Browser neu und wiederholt
die ausstehende Bewertung. Später erhält dieselbe Anki-Notiz durch einen Import
eine neue numerische ID. Quelle und Lernfortschritt müssen derselben Karte gehören.

**Painpoint:** Native Bewertung und UniOS-Fortschritt besitzen getrennte Datenbanken.
Der frühere Receipt-Replay konnte den SQL-Abgleich überspringen. Eine wechselnde
Notiz-ID verlor die Fortschrittszuordnung. Zusätzlich blieb die Lernübersicht nach
erfolgreicher Bewertung bis zum Ablauf ihres Lesecaches bei „0 Wiederholungen“.

**Konzept:** Nativer Scheduler bleibt maßgeblich. Der tatsächliche Review und ein
Receipt werden gemeinsam bestätigt. Der SQL-Mirror wird auch bei identischer
Wiederholung repariert. Die Lernübersicht aktualisiert sich nach dem ACK sofort.

**Umsetzung:** `study_review_receipts.py` speichert die tatsächlich neu angelegte
Revlog-ID, native Notiz und stabile Herkunft im selben offiziellen
`DBProxy.transact` wie `answerCard`. Eine fehlgeschlagene Receipt-Anlage rollt auch
die Bewertung zurück. Der Abgleich arbeitet erst nach Schließen der Collection.
`study_review_service.py` löst eigene Karten anhand `unios-manual-<UUID>` auf und
behält die vorhandene `AnkiCard.id` samt historischen Review-FKs. Fremde Karten
erhalten keine erfundene Themenzuordnung; mehrdeutige Bindungen führen zu Konflikten.

Die additive Migration `ff98c7da0320` ergänzt `AnkiReview.review_id` als nullable,
eindeutige Kennung. Neue und wiederholte native Bewertungen schreiben genau einen
SQL-Mirror mit tatsächlicher UTC-Revlog-Zeit. Ein SQL-Ausfall nach NativeCommit
liefert 503; der identische Request repariert den Mirror. Desktop-Agent und native
Engine deduplizieren dasselbe Ereignis auch bei unterschiedlicher Ankunftsreihenfolge.
Alte Receipts ohne Herkunft/Zeit bleiben replay-kompatibel; historische Zeiten
werden nicht rekonstruiert. Die Migration wurde nur an synthetischen Beständen geprüft.

Ein zusätzlicher echter SDK-Repro zeigte: Löschen oder Neuanlegen der ursprünglichen
nativen Karte zwischen NativeCommit und Retry blockierte den Replay mit 404.
Ein bestätigter Receipt kann seinen historischen SQL-Mirror nun über die gespeicherte
kanonische GUID und genau eine vorhandene SQL-Bindung reparieren. Die ursprüngliche
SQL-Karten-ID und Reviewzeit bleiben erhalten; eine heutige Ersatzkarte wird weder
umgebunden noch nochmals beantwortet. Der ACK liefert in diesem Fall
`already_applied: true` und `card: null`. Ein neuer Request ohne vorhandenen Receipt
benötigt weiterhin eine echte native Karte.

`studyQueries.ts` aktualisiert nach Review-ACK neben allen Scoped Study-Reads die
Lernstand-, Modul-, Wochen-, Block-, Zyklus-, Analyse- und Übersichts-Caches.
Offline-Snapshots bleiben erhalten. Der Browserfall „Bewertung → sofort zurück
zur Übersicht“ prüft den echten sichtbaren Themenzähler und Wochenstand.

Ein Serverwechsel erhält vor seinem HTTP-Aufruf einen dauerhaften Binding-Fence.
Ein geteilter Web Lock umfasst Hostprüfung, POST und ACK; Pairing verwendet den
exklusiven Lock. Ein 30-Sekunden-Limit gibt den Lock auch bei ignoriertem Abort frei,
der unklare Request bleibt erhalten. Erfolgreiche Kopplung rotiert den Namespace.
Nur die belegte Ablehnung vor dem Speichern (401) darf denselben Namespace wieder
freigeben. Unklare Antworten oder ein Rotationsfehler lassen alte Writes gesperrt.

## 4. Konkrete Umsetzung und Abnahme

Die maschinenlesbaren Resultate stehen in `validation-summary.json`; der
Lighthouse-Bericht nennt alle Einzelzustände und Detailaudits in
`lighthouse-accessibility-summary.json`. Die vollständige lokale Integration ist
am eingefrorenen Produktstand abgeschlossen:

- Python: 984 bestanden, zwölf übersprungen, 979,41 s. Auswahl: Git-gelistete
  `tests/test_*.py` plus die beiden neuen Bridge-Dateien beim Prozessstart;
  frisches synthetisches Basetemp und isolierte Factory.
- Frontend: 628 bestanden in 67 Dateien, 8,21 s.
- Gesamte Browserabnahme: 312 bestanden, 537,91 s; keine Fehler, Skips oder
  flakigen Erfolge. Gezielter Abschlusslauf: 13 bestanden, 54,25 s.
- Lighthouse: 16 Zustände mit 100; alle 358 numerischen Detailaudits einschließlich
  Gewicht null ohne Befund, Warnung oder Laufzeitfehler.
- Ruff, mypy für 566 Quellen, TypeScript, vollständiges ESLint, i18n für 61
  Namespaces, OpenAPI/Typen, Node-Syntax und SPDX für 1513 eigene Textdateien grün.
- Build und Bundle-Grenzen bestanden, keine neuen Abhängigkeiten. PWA:
  236 eindeutige Dateien, 16.517.720 Byte roh und 4.449.336 Byte gzip,
  jeweils innerhalb der bestehenden Grenzen.

Identischer finaler Buildhash für Browser, Lighthouse und Bundleprüfung:
`be366997c9ab7483e688c9c5da59cc7f6fc752ef60dd2506abc85caf3b710566`.
Alle 16 finalen Originalaufnahmen selbst visuell geprüft. 188 frühere Originalbilder
sind erhalten; 18 durch die Gesamtabnahme regenerierte historische Bilder wurden
anschließend aus der Sicherung wiederhergestellt. Rohlogs und Sicherungskopien
sind nicht Teil dieses Pakets.

Die Browserabnahme umfasst echte gemeinsame IDB-Fenster mit verpassten Meldungen,
gleichzeitiges Speichern, verlorenes ACK mit geschlossenem Sender, verspätetes ACK
nach neuer Karte, NativeCommit/SQL503/Neustart, geänderte native Notiz-ID, zwei
Offline-Deckfenster und sofortige Rückkehr zur Lernübersicht. Backendfälle prüfen
zusätzlich Receipt-Rollback, beide Desktop-Reihenfolgen, bestehende Review-FKs,
UUID-Konflikte und kompatible alte Receipts. Frontendfälle prüfen CAS, Legacy-Kopien,
Binding-Fences, Speicherabbrüche und fehlendes `crypto.randomUUID` mit sicherem
`getRandomValues`-Fallback.

Originalbilder: Dialog, Konflikt, aufgedeckte native Session und eigener Kartenbereich,
jeweils Hell/Dunkel sowie 1440/390 px. Der Runner wartet auf echte endliche
Animationen und prüft Sichtbarkeit vor/nach Aufnahme und Lighthouse; Radix-Präsenz
wird nicht künstlich deaktiviert. Frühere QA-Aufnahmen bleiben historische Belege.

**Grenzen:** Keine physische MacBook-/Safari-/nativer-WebView-Abnahme. Server-Saves
eigener Karten erfordern Web Locks; ohne diese Fähigkeit bleiben IDB-Entwürfe lokal
bearbeitbar und die Einschränkung sichtbar. Import-ID-Wechsel ist synthetisch über
die native Datenbank geprüft, kein behaupteter Live-APKG-Import. Alte Receipts
erhalten keinen erfundenen historischen SQL-Mirror. Externe Live-Anki-Kommunikation,
native Installer und echte Bestandsmigration bleiben gesondert abzunehmen.

Der Receipt-only-Abgleich nach nativer Kartenlöschung gilt für eigene Karten mit
kanonischer UUID-GUID und vorhandener eindeutiger SQL-Bindung. Eine weiterhin
vorhandene verwaltete KI-Karte wird im normalen Reviewpfad gespiegelt. Die ältere
KI-Identität `unios-<queue_id>` erhält nach Löschung ihrer nativen Karte dagegen
einen nativen Receipt-ACK, ohne einen fehlenden historischen SQL-Mirror zu erfinden.
Die sichere historische Identität dieser älteren KI-Karten ist ein eigener
Anschluss; dieser Paketbericht behauptet dafür keine Reparatur.

**Nächster Produkthebel:** Fokussierte Lernarbeit: Ein angenommener Analysis-Block
öffnet direkt einen Arbeitsbereich mit Kurs-/Themenkontext, Quelle, Mitschrift und
passenden Wiederholungen. Eine dominante Arbeitsfläche und progressive Hilfsbereiche
reduzieren den heutigen Weg über globale Übersichten. Danach ein Konzeptboard mit
rückverfolgbaren Quellknoten; mathematisches Rendering und Karten aus Notizblöcken
werden daran angeschlossen. Vertrag und Komponentenfolge stehen in
[STUDY_WORKFLOW_NEXT_PACKAGES.md](../../STUDY_WORKFLOW_NEXT_PACKAGES.md).

## Primärquellen für die technischen Muster

- [IndexedDB: Transaktionsreihenfolge](https://www.w3.org/TR/IndexedDB/#transaction-scheduling)
  begründet atomare Änderungen im gemeinsamen Object Store.
- [Web Locks: Lock-Lebensdauer und Abort](https://www.w3.org/TR/web-locks/#dom-lockoptions-signal)
  begründet gemeinsame/exklusive Koordination plus eigenes Request-Zeitlimit.
- [Anki DBProxy](https://github.com/ankitects/anki/blob/main/pylib/anki/dbproxy.py)
  beschreibt offizielle gemeinsame Backend-/SQL-Transaktionen.
- [Playwright: mehrere Seiten](https://playwright.dev/docs/pages)
  beschreibt die BrowserContext-Mehrfensterszenarien. Die Tests verwenden echte
  gemeinsame Speicher statt getrennte Kontexte mit unabhängigen Daten.
