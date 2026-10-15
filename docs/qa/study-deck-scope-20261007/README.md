<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Lernstapel: Scope, Tageszähler und Offline-Neustart

Stand: 07.10.2026. Produktcode und vollständige lokale Integration sind abgenommen.
Alle Prüfdaten sind erfunden und liegen in isolierten
temporären Collections. Keine Migration oder Änderung privater Bestände.

## 1. Sofort löschen / aufräumen

Der Clientfilter nach exaktem Kartendeck und die Zählung aus der globalen
100er-Auswahl sind entfernt. Sie verloren später berücksichtigte Decks und
Karten aus Unterstapeln. Gemeinsame Vertragstypen ersetzen lokale StudyCard-
Duplikate. HTTP-Validierung, Lernregeln und Anki-Zugriff erhalten einen kleinen
API-/Service-/Repository-Schnitt. Sichere Kartendarstellung bleibt gemeinsam.

## 2. UI/UX-Kritik & Redesign

**Nutzerszenario:** Ein Student lernt aus mehreren großen Skripten. Stapel A
enthält 101 neue Karten; er öffnet bewusst den kleinen Stapel B mit einer Karte.
Die bisherige Anzeige suggerierte, B sei leer. Die Sitzung bezieht ihre Auswahl
direkt von Anki für B. Die Übersicht zeigt native Tageskategorien;
der Fortschritt zählt ausschließlich die Karten dieser Sitzung.

Ein Elternstapel enthält seine Unterstapel. Bei einer begrenzten Sitzung heißt
der Abschluss „Diese Sitzung abgeschlossen“; eine weitere Sitzung startet
bewusst mit einer neuen Auswahl. Wartende Lernschritte und fehlender Offline-
Download erhalten verschiedene Zustände und konkrete nächste Aktionen.

Kategorien und Fortschritt stehen unmittelbar bei der Karte. Die Erklärung
zum Stand der Auswahl öffnet sich bei Bedarf über ein natives Details-Element.
Enter/Leertaste bedienen dieses Element, ohne zugleich eine Antwort aufzudecken.
Die Antwortaktion bleibt auch bei 390 px ohne Scrollen erreichbar.

Die sichtbare Deckliste steht auch im DOM vor Verwaltung und Statistik. Tab
führt vom Kartenbrowser zur darunterliegenden Verwaltung. Das Diagramm ist
eine benannte Gruppe. Kleine Zeilenuntertitel bleiben bei Hover/Fokus lesbar;
der Link zur Lernübersicht ist unabhängig von seiner Farbe unterstrichen.

## 3. Workflow- & Feature-Lücken

Offline-Neustart darf bereits lokal bewertete Karten nicht erneut zur Bewertung
anbieten. Vor der ersten Karte liest die Sitzung deshalb auch die haltbare
Outbox. Ein Online-Neustart lädt eine frische Auswahl; laufende Sitzungen behalten
ihren Fortschritt bei Hintergrundabgleichen. Ein noch nie geöffnetes Deck wird
offline als nicht gespeichert bezeichnet. Der globale Tages-Prefetch ist kein
vollständiger Download aller Stapel.

Eine vor dem Bewertungs-ACK gelesene Serverantwort kann erst nach diesem ACK
ankommen. Auch ein ungültig gemachter Query-Cache genügt dafür nicht: ein noch
laufender Request kann dieselbe alte Antwort zurückgeben. Die frische Auswahl
bricht deshalb exakt den überholten Scoped Request ab und startet danach neu;
ein inzwischen gewechselter Stapel kann keine neue Initialisierung abbrechen.

Dauerhafte eigene Lernkarten aus PDF-Markierungen, Quellenherkunft und ein
persistentes Konzeptboard gehören zu eigenen Folgepaketen. Dieses Paket behebt
die vorhandene Anki-Lernstrecke und behauptet diese Funktionen nicht.
Der nächste konkrete Schnitt steht in
[MANUAL_SOURCE_CARD_PLAN.md](../../MANUAL_SOURCE_CARD_PLAN.md).

## 4. Konkrete Umsetzung

- `GET /api/anki/study/due?deck=…` löst vorhandene kanonische Namen auf, wählt
  vor dem 100er-Fenster den Scope und übernimmt Reihenfolge, Limits und Zähler
  des offiziellen Schedulers. Ein 101er-Lookahead liefert `has_more`.
- `/stats` verwendet einen nativen Deckbaum für alle Zähler. Globale Summen
  addieren Wurzeln einmal; eigener Bestand und Bestand mit Unterstapeln sind
  getrennt. Keine Queue oder HTTP-Anfrage pro Tabellenzeile.
- Reviews und neue Outbox-Einträge tragen optional `study_deck_id`. Alte Einträge
  bleiben gültig. Passende Receipts werden vor einer aktuellen Scopeprüfung
  wiedererkannt; die alte Auswahl wird unter dem Collection-Lock wiederhergestellt.
- Query-/Offline-Keys enthalten die vollständige URL. Nach einem erfolgreichen
  oder teilweise erfolgreichen Replay werden auch alle vorhandenen Scoped Reads
  invalidiert. Private Karteninhalte werden nicht zusätzlich in sessionStorage
  geschrieben.
- Backendmodelle, exportierter OpenAPI-Vertrag und generierte Frontendtypen
  beschreiben denselben Scope, dieselben Kategorien und denselben Lookahead.

Plan und Grenzen: [STUDY_DECK_SCOPE_PLAN.md](../../STUDY_DECK_SCOPE_PLAN.md).
Grundlage für Unterstapel und Limits: [Anki Studying](https://docs.ankiweb.net/manual/studying)
und [Deck Options](https://docs.ankiweb.net/manual/deck-options).

## Abnahmestand

Der Kernfehler wurde mit der echten temporären Anki-Engine vor der Korrektur
reproduziert: `due?deck=Uni::B` lieferte 100 A-Karten. Derselbe Test liefert nach
der Korrektur exakt B. Ein echter QueryObserver und ein Browserfall reproduzierten
außerdem die vor dem ACK gelesene, verspätete Antwort: zuvor Karte A001 erneut,
nach der Korrektur A002, genau ein Anki-Review/Receipt und eine leere Outbox.
Zwei Unitfälle und ein nativer Tab-Browserfall belegten die falsche Reihenfolge
vor dem DOM-Umzug und bestanden danach.

Vollständige Backend-Abnahme: **908 bestanden, zwölf übersprungen**, 14:29 min.
Vollständiges Frontend: **565 bestanden in 60 Dateien**. Ruff, mypy für 548
Quellen, TypeScript, vollständiges ESLint, i18n sowie OpenAPI und generierte Typen
bestanden. Produktionsbuild und alle Bundle-Grenzen bestanden. 236 eindeutige
Precache-Assets: 16.467.422 Bytes roh, 4.435.389 Bytes gzip, unter 18 MiB/5 MiB.

Lighthouse 13.5.0: Übersicht und tatsächliche B-Sitzung jeweils **100**; keine
Runtimefehler, Warnungen oder numerischen Detailaudits unter 1, auch bei Gewicht
null. Zuvor meldete die Übersicht einen nur durch Farbe erkennbaren Footerlink
(95); die Sitzung einen durch Opacity zu schwachen Tastaturhinweis (95).
Beide konkreten Fehler sind am identischen letzten Build behoben.
[Prüfauszug](lighthouse-accessibility-summary.json).

Der gezielte letzte Browserlauf bestand mit drei Fällen: Held-Upload, native
Tastatur-/Bildabnahme und alle Hauptoberflächen in vier Layouts. Der gemeinsame
299-Fälle-Lauf bestand am identischen finalen Build in **8:01 min**, ohne
Fehler, Skips oder flakige Erfolge. Die zwei alten Study-HTTP-Fixtures wurden auf den
Scoped Vertrag aktualisiert; Zeitgrenzen und Ablaufassertions blieben aktiv.
Im allgemeinen Designaudit prüft jede Study-Aufnahme jetzt die tatsächliche
Deckzeile, statt einen Stats-Fehler hinter einer vorhandenen Überschrift zu übersehen.
[Gesamtauszug der Abnahme](validation-summary.json).

## Aufnahmen und Grenzen

Alle acht Originalaufnahmen des letzten Builds sind visuell geprüft.
Die schmale Sitzung zeigt die Antwortaktion im ersten Bildschirm. Die
Ganzseitenaufnahme der Übersicht setzt mehrere Scrollbereiche zusammen;
die feste Mobilnavigation sitzt dabei auf Höhe des ursprünglichen Viewports.

| Ansicht | Hell, 1440 px | Dunkel, 1440 px | Hell, 390 px | Dunkel, 390 px |
| --- | --- | --- | --- | --- |
| Stapel | [Öffnen](decks-light-1440.png) | [Öffnen](decks-dark-1440.png) | [Öffnen](decks-light-390.png) | [Öffnen](decks-dark-390.png) |
| Sitzung B | [Öffnen](session-light-1440.png) | [Öffnen](session-dark-1440.png) | [Öffnen](session-light-390.png) | [Öffnen](session-dark-390.png) |

Docker-Smoke bleibt mangels erreichbarer lokaler Engine offen. Physische
MacBook-Trackpads, native WebViews und Installer wurden nicht abgenommen.
Synthetische Szenarien belegen korrekte Auswahl und Wiederaufnahme; sie messen
keine reale Lernleistung oder eingesparte Minuten. Kein Push oder Deployment.
