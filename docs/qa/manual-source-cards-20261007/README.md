<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Eigene Lernkarten mit dauerhafter PDF-Quelle

Stand: 07.10.2026. Lokale Umsetzung; ausschließlich synthetische Daten, echte
temporäre PDF-Dateien und native Anki-Collections. Keine privaten Bestände oder
Hochschulkonten verwendet. Keine Live-Migration, kein Push oder Deployment.

Die am Ende dieses damaligen Reviews genannten Mehrfenster-/Review-Brücken-Lücken
werden im nachfolgenden [Recovery-Paket](../study-recovery-20261007/README.md)
behandelt. Die Resultate und Aufnahmen hier dokumentieren weiterhin diesen Stand.

## 1. Sofort löschen / aufräumen

**Painpoint:** Die bisherige Queue validierte jeden gespeicherten Eintrag als
KI-Vorschlag mit Pflicht-Konfidenz. Eigene Karten hätten damit künstliche
KI-Metadaten benötigt und das KI-Vorschlagsbudget verbraucht. Native Übernahme
und Desktop-Agent behandelten HTML sowie Kartenidentität unterschiedlich.

**Konzept:** Gemeinsamer gespeicherter Karteninhalt, ausdrücklich getrennte
Herkunft und weiterhin strenger KI-Import. Eigene Frage/Antwort bleiben Klartext.

**Umsetzung:** Inhalt und KI-Validierung nach `app/anki/card_schema.py`
extrahiert; `CardProposal` bleibt am alten Importpfad verfügbar und verlangt
weiterhin Konfidenz. Queue-Parser berücksichtigen die serverseitige Herkunft;
Budget zählt ausschließlich KI-Vorschläge. Die Sammelübernahme und die neue
Einzelübernahme verwenden denselben `TransferService`. Kein zweiter Scheduler,
keine neue Bibliothek und keine pauschale Umdeutung vorhandener KI-Karten.

## 2. UI/UX-Kritik & Redesign

**Painpoint:** Ein Student liest ein 120-seitiges Skript, markiert ein Konzept
und formuliert eine Frage. Reader-Recall deckte bislang nur das Zitat auf;
eine dauerhafte Lernkarte erforderte einen anderen Arbeitsablauf. Ein verlorener
Speicher-Response oder ein veralteter Anker konnte zu wiederholten Fehlversuchen
führen. Lange Formulare dürfen die Aktion auf 390 px nicht aus dem Blick nehmen.

**Konzept:** Eine ruhige Aktion „Als Lernkarte“ an gespeicherten Markierungen
und Recall-Übungen öffnet einen gemeinsamen Dialog. Desktop zeigt Quelle und
Eingaben nebeneinander; Mobilansicht stapelt sie mit scrollbarem Inhalt und
feststehender Aktionszeile. Frage, Antwort, Thema und tatsächlicher Zielstapel
sind sichtbar. Das Zitat liefert den Antwortentwurf; die eigene Frage bleibt
bearbeitbar und wird ausdrücklich mit „Speichern & freigeben“ bestätigt.

**Umsetzung:** `ManualCardDialog`, `manualCardDraft` und `manualCardTypes` werden
von `ReaderParts`, `ReaderAnnotations`, `ReaderStudyTools` und `MaterialPage`
verwendet. Radix übernimmt Dialogsemantik und Tastaturfokus. Alle Texte sind
de/en übersetzt. Ausstehende Offline-Markierungen können noch keine Karte
erzeugen; ein eigener Offline-Entwurf bleibt editierbar und lokal gespeichert.

Eigene gespeicherte Karten sind unter `/study/cards` erreichbar, auch wenn der
optionale KI-Bereich ausgeblendet ist. Der Quellenfilter greift vor dem
200er-Listenlimit; ein direkter Kartenlink lädt bei Bedarf die ältere Karte
zusätzlich über ihre Kennung. Ein langer Quellenname wird in der Session umbrochen.
Beim Wechsel Desktop → Mobil besitzt nur der Kartendialog den Fokus; sein
Schließen führt zur ursprünglichen Aktion zurück. Nicht gespeicherte Kommentare
und die laufende Recall-Position bleiben bei diesem Wechsel erhalten.

Ein unklar bestätigter Request bleibt mit seinem exakten Payload gesperrt und
wiederholbar. Bei einer serverseitig garantiert vor dem Speichern abgelehnten
Quellenänderung erhält der Nutzer „Quelle erneut prüfen“ und eine neue
Quellenvorschau. Erst „Geprüfte Quelle übernehmen“ erzeugt eine neue Kennung;
eigene Texte bleiben erhalten. UUID-Inhaltskonflikte erlauben diese Abkürzung
nicht. Unlesbare Entwurfsspeicher sperren eine möglicherweise ältere Kopie.
Bereits bestätigtes `pushed` kann durch einen verspäteten Statusread nicht
zurückgesetzt werden.

Die tatsächliche Lighthouse-Abnahme fand zusätzlich farblich allein markierte
Quellen-/Kurslinks und einen nicht zum sichtbaren Suchtext passenden Namen der
Befehlspalette. Quellen-/Kurslinks werden unterstrichen; die Suchschaltfläche
erhält ihren Namen direkt aus ihrer Beschriftung und dem Tastaturhinweis.
Die mobile Symbolansicht besitzt weiterhin einen lesbaren zugänglichen Namen.

Die visuelle Mobilprüfung zeigte außerdem doppelte Fragen beim Aufdecken:
Die native Anki-Antwort enthält bei `UniOS Basic` bereits `FrontSide`, während
die UI zusätzlich die Frage renderte. Beim Aufdecken ersetzt nun die vollständige
native Antwort die vorherige Fragenansicht. Es wird kein HTML-Fragment geraten
oder entfernt; die Quelle bleibt erreichbar und der native Scheduler unverändert.

## 3. Workflow- & Feature-Lücken

**Painpoint:** Eine Markierung wandert von V1/Seite 12 nach V2/Seite 17. Ein
Link zur aktuellen Markierung würde die ursprüngliche Kartenquelle verändern.
Anki-Notiz-IDs können beim Import wechseln; SQL und Anki besitzen keine gemeinsame
Transaktion. Ein älterer Desktop-Agent versteht GUID-basierte eigene Karten nicht.

**Konzept:** Dauerhafte freigegebene Karte plus eingefrorener Quellen-Snapshot,
stabile UUID und wiederholbare Einzelübernahme. Bestätigte Speicherung und
tatsächlich erfolgte Anki-Übernahme werden getrennt angezeigt.

**Umsetzung:** Die additive Migration `ff97d2a90616` ergänzt Queue-Herkunft,
eindeutige Mutation, Quellenversion und Snapshot. UUID-Replay wird vor einer
erneuten Ankerprüfung erkannt. Eine neue Karte wird unter dem vorhandenen
Ressourcenlock und mit frischer Revision geprüft und gespeichert; der Lock ist
vor der Anki-Übernahme frei. Ein Crash nach NativeCreate und vor SQL-Ack wird über
`unios-manual-<UUID>` wieder aufgenommen. Mehrere GUID-Treffer bleiben ein
sichtbarer Konflikt. Native und Desktop-Agent nutzen denselben Klartextvertrag.

Alte Agenten erhalten weiterhin KI-Karten; eigene Karten werden erst bei
angekündigter `manual-guid-v1`-Unterstützung ausgeliefert. Im externen Modus bleibt
eine Karte dauerhaft „Übernahme ausstehend“, bis der Agent sie bestätigt. Bei
integriertem Betrieb wird gezielt nur diese Karte übernommen.

`StudyCard.source` ergänzt den Rücksprung zur eingefrorenen Version/Seite.
`StudySourceRepository` lädt Quellen in einer gebündelten Abfrage anhand der
stabilen GUID, nachdem die native Collection geschlossen wurde. Unzuordenbare
Importe haben eine unbekannte Quelle. Queue, Browser, Status, Stats und Scoped
Due-Caches werden aktualisiert; die bereits gestartete Sitzung bleibt eingefroren.

Offen bleiben Karten aus ungespeicherter Rohselektion, Notizblöcken und
Sammelerstellung sowie Konzeptcanvas und mathematisches Notizrendering. Diese
Erweiterungen sind keine Voraussetzung für den jetzt implementierten PDF-Ablauf.

Zwei weitere Grenzen sind im unabhängigen Quellcode-Review gefunden: Mehrere
Fenster koordinieren lokale Änderungen am selben Kartenentwurf noch nicht;
die Serverkennung verhindert widersprüchliche Speicherung, ersetzt aber keine
Konfliktkopie des lokalen Texts. Wechselt eine native Notiz-ID nach einem Import,
bleibt die Quelle über ihre GUID zugeordnet. Die bestehende SQL-Brücke für
Block-/Zyklusfortschritt sucht dagegen noch anhand der alten Notiz-ID. Native
Anki-Bewertungen bleiben im offiziellen Scheduler; Fortschrittszuordnung und
fensterübergreifende Entwurfskoordination sind die nächsten gezielten Korrekturen.

## 4. Konkrete Umsetzung und Abnahme

- Backend: `manual_api.py` → `manual_service.py` → `manual_repository.py`;
  `transfer_service.py` / `transfer_repository.py`, gemeinsame Inhaltsmodelle.
- Frontend: Reader-Aktion, gemeinsamer Dialog, haltbarer Entwurf, Queue-Herkunft
  und Übernahmestatus sowie Quellenlink in der echten Lernsession.
- Neue Backendfälle: Quellen-/Revisionsprüfung, verlorenes ACK, konkurrierende
  Wiederholung, Annotationlöschung/Reanchor, Writer-/Auth-Gates, Migration und
  bestehende KI-Grenzen, Native-/Agent-GUID und Klartext, Einzel-/Sammelübernahme.
- Browser: echte V1/12 → Karte → native Session → Quellenrücksprung → Bewertung;
  V2/17-Reanchor, verlorene Antwort mit Reload, Offline-Entwurf im externen Modus
  und bewusste Konfliktwiederherstellung.
- `scripts/audit_manual_cards.mjs --fake-data` prüft per Lighthouse-Snapshot den
  tatsächlich geöffneten Dialog, die beantwortete Session und den eigenen
  Kartenbereich in Hell/Dunkel bei 1440 und 390 px. Es startet ausschließlich
  frische lokale Fake-Dienste.

Die vollständige Integration besteht 956 Python-Fälle (zwölf übersprungen),
607 Frontend-Fälle in 65 Dateien und 303 Browserfälle ohne Skip, Fehler oder
flakigen Erfolg. Ruff, mypy (561 Quellen), TypeScript, ESLint, i18n (61 Namespaces),
OpenAPI/Typen und sämtliche Bundle-/PWA-Grenzen bestehen. Lighthouse erreicht
in allen zwölf Zuständen 100; auch ungewichtete numerische Detailaudits sind
fehlerfrei, ohne Laufzeitfehler oder Warnungen. Ein abschließender gezielter Lauf
der vier Quellenkarten-Szenarien besteht nach der Korrektur der Bildaufnahme.
Alle zwölf Originalaufnahmen wurden selbst visuell geprüft.

`validation-summary.json` hält Ergebnisse, Grenzen, Buildhash und Bildprüfsummen
fest; `lighthouse-accessibility-summary.json` enthält die zwölf Einzelabnahmen.
Browser, Lighthouse und Bundleprüfung verwenden denselben Produktbuild. Die
Bildaufnahme wartet auf beendete endliche Animationen, statt Radix-Präsenzanimationen
künstlich vorzuspulen. Docker-Smoke konnte bei nicht erreichbarer lokaler Engine
nicht ausgeführt werden.
Synthetische Abläufe belegen keine gemessene Lernzeitersparnis oder Lernleistung.
Physische MacBook-Gesten, native WebView/Installer und reale externe Anki-Desktop-
Kommunikation benötigen weiterhin die manuelle Geräteabnahme. Vor einer Migration
am echten Bestand erstellt Marc einen geprüften Snapshot.

### Originalaufnahmen

| Ansicht | Hell 1440 px | Dunkel 1440 px | Hell 390 px | Dunkel 390 px |
| --- | --- | --- | --- | --- |
| Quellenkarten-Dialog | [Foto](dialog-light-1440.png) | [Foto](dialog-dark-1440.png) | [Foto](dialog-light-390.png) | [Foto](dialog-dark-390.png) |
| Aufgedeckte native Karte | [Foto](session-light-1440.png) | [Foto](session-dark-1440.png) | [Foto](session-light-390.png) | [Foto](session-dark-390.png) |
| Eigene gespeicherte Karten | [Foto](cards-light-1440.png) | [Foto](cards-dark-1440.png) | [Foto](cards-light-390.png) | [Foto](cards-dark-390.png) |

## Referenzmuster

Die Verbindung von Exzerpt und Ursprung folgt dem beschriebenen
[LiquidText-Arbeitsablauf](https://www.liquidtext.net/liquidtextadeeperdive).
Eigene Frage/Antwort mit regelmäßiger Wiederholung entspricht dem Ablauf von
[Goodnotes Study Sets](https://support.goodnotes.com/hc/en-us/articles/7353756529551-Getting-Started-with-Study-Sets-and-Smart-Learn).
Felder, Themen-Tags und native Decks orientieren sich am
[Anki-Editor](https://docs.ankiweb.net/editing.html).
Das sind Produktmuster; hierfür wurde kein Fremdquellcode kopiert. Die vorhandene
offizielle Anki-SDK übernimmt den Scheduler und FSRS.
