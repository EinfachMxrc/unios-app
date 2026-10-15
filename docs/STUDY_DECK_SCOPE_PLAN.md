<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# P1: Lernsession im gewählten Anki-Deck

Stand: 07.10.2026. Produktcode und vollständige lokale Integration sind abgenommen:
908 Python-, 565 Frontend- und 299 Browserfälle bestanden. Die Reader-/Suchbaseline
ist vorher vollständig
abgenommen worden. AGENTS, Bauauftrag Abschnitt 18 und PROGRESS sind berücksichtigt.
Alle Prüfungen verwenden synthetische Daten; keine privaten Bestände gelesen.
Ergebnisse und Aufnahmen: [QA-Bericht](qa/study-deck-scope-20261007/README.md).
Die folgenden Belege zum bisherigen Fehler beziehen sich auf den Stand vor dem Fix.

## Problem und Paketgrenze

Ein Student öffnet Analysis, während ein früher berücksichtigtes Deck bereits
mehr als 100 fällige Karten enthält. Analysis erscheint leer, obwohl der offizielle
Scheduler für dieses Deck Karten liefern würde. Ursache: `study_api.py:156–171`
sammelt je Wurzeldeck höchstens 100 Karten, `/due` kappt nochmals global auf 100
(`:218–225`), `StudySessionPage.tsx:39–56` filtert erst danach nach Kartendeck.
Die Decktabelle zählt dieselbe begrenzte Auswahl (`StudyPage.tsx:63–65,321`).

Dieses Paket korrigiert Deckauswahl, Zählung, Reviewkontext und Cacheanschlüsse.
Es braucht keine Alembic-Migration, neue Anki-Tabellen oder Abhängigkeiten. Manuelle
Lernkarten, Quellenherkunft, Lernblöcke und Boards bleiben getrennte Folgepakete.
Reader-/Material-Komponenten und deren Styles gehören nicht in dieses Paket.

## Verbindliche Defaults für den Vertrag

| Entscheidung | Default und Begründung |
| --- | --- |
| Deck auswählen | Optionales `deck` bei `GET /api/anki/study/due`, Name mit 1–1024 Zeichen. Bestehende Session-URL und parameterloser GET bleiben kompatibel. |
| Namen auflösen | Vorhandenen kanonischen Namen exakt aus Ankis Namen-/ID-Katalog auflösen. Keine Präfixsuche, eigene Normalisierung oder stille Erstellung. Unbekanntes Deck: 404; syntaktisch ungültige Query: 422. |
| Unterdecks | Die Auswahl umfasst das gewählte Deck und seine Unterdecks, entsprechend Anki. Die zurückgegebene stabile Deck-ID bezeichnet den gewählten Scope, nicht das Deck einer einzelnen Karte. |
| Tageslimits und Reihenfolge | Offizielle Engine entscheidet über Tageslimits, Gather-/Sort-Regeln, Burying und `Limits Start From Top`. Keine SQL-`is:due`-Ersatzlogik und kein Filtern nach dem Schedulerfenster. |
| Queuegröße | Maximal 100 Karten pro Antwort. Scoped Fetch mit 101 liefert einen begrenzten Lookahead; `has_more` bedeutet, dass dieses Queuefenster weitere Karten enthält. |
| Counts | Native Anki-Zähler bleiben vom 100er-Fenster getrennt. Sie sind keine Behauptung über den ungefilterten Bestand oder die Zahl verschiedener Karten. |
| Auswahlzustand | Vorheriges `selected()` innerhalb desselben Collection-Locks sichern, Auswahl in `finally` wiederherstellen; auch bei Fehlern. |
| Bewertungsscope | Optionales positives `study_deck_id` im Review und der Outbox. Ohne Feld bleibt die bisherige Auswahl über `card.did` erhalten. |
| Idempotenz | Receipt-Semantik bleibt `(review_id, card_id, rating)`. Scope ist Ausführungskontext, keine zusätzliche Bewertungssemantik. |

Anki beschreibt die Auswahl einschließlich Unterdecks im
[Studierhandbuch](https://docs.ankiweb.net/studying.html#decks). Tageslimits und
Darstellungsreihenfolge hängen vom gewählten Deck ab; Unterdecklimits und
`Limits Start From Top` bleiben Engine-Regeln.
[Deckoptionen](https://docs.ankiweb.net/deck-options.html#daily-limits)

### Antwort und Kompatibilität

Eine typisierte `StudyDueResponse` erhält die bestehenden `cards` und
`generated_at` und ergänzt:

```text
scope: { deck_id: positive int, deck_name: string, includes_subdecks: true } | null
counts: { new: int >= 0, learning: int >= 0, review: int >= 0 }
has_more: boolean
```

`scope=null` bezeichnet ausschließlich den bisherigen globalen Leseweg. Scoped
Karten dürfen Unterdecks enthalten; die UI übernimmt deren Reihenfolge unverändert.
Die Anki-Zähler werden mit passenden Kategorien bzw. „heute geplant“ bezeichnet,
nicht als Länge dieser Sitzung. Bei leerem Queuefenster und positiven Lernzählern
steht „Jetzt keine Karte verfügbar“ statt „Heute nichts zu lernen“.

Parameterloser `/due` bleibt für bestehende Verbraucher und Tages-Prefetch erhalten;
sein begrenztes Kartenfenster darf weder Deckleerheit noch vollständigen Offline-
Download beweisen. `has_more` wird aus den begrenzten Wurzeldeckfenstern und der
globalen Abschneidung abgeleitet. Globalzahlen aggregieren nur Wurzel-Scopes;
Eltern und Kinder werden nicht doppelt addiert.

## Kleiner API-/Service-/Repository-Schnitt

Heute liegt die Fachlogik in `app/anki/study_api.py`; eigene Study-Service- und
Repository-Dateien fehlen. Die Extraktion umfasst die tatsächlich betroffenen
Operationen und gemeinsame Serialisierung, nicht alle Anki-Routen.

- `study_api.py`: Query-/Body-Validierung, Response-Modelle, HTTP-Fehlerzuordnung
  und vorhandene Writer-/Modusprüfungen. `/due`, Deckmetadaten und `/reviews`
  delegieren an den Service. Bestehende Paket-/Import-/Media-Routen bleiben dort.
- Neue `study_service.py`: Scopeentscheidung, 100er-Sitzungsgrenze, DTO-Aufbereitung
  und Reihenfolge der Idempotenz-/Zeit-/Eligibility-Prüfungen. Bestehendes sicheres
  Kartenrendering einmal gemeinsam weiterverwenden, nicht parallel kopieren.
- Neue `study_repository.py`: Anki-Katalog, Queue-/Zählungsprojektionen, Receipt-
  Zugriff und Bewertung sowie bestehende AnkiReview-Zuordnung. Datenzugriff nutzt
  `open_collection()` und dessen `RLock`; keine eigene Verbindung oder Locks pro
  Service/Route. Fachentscheidungen und HTTP-Statuscodes bleiben im Service/API.
- `app/main.py`: Service/Repository einmal für den vorhandenen Study-Router
  verdrahten. Die vorhandene optionale Anki-Verfügbarkeit bleibt erhalten.

Die Datenprojektion wird vor Collection-Schließung materialisiert; keine lazy
Card-/Note-Objekte nach außen geben. Queuekarten, letzter Review und HTML werden
gebündelt gelesen, die bestehende `_last_review_ms_batch`-Logik wird erhalten.
Keine Collection pro Tabellenzeile oder einzelne HTTP-Anfrage pro Kartenzähler.

## Zählung und Performance

Für eine aktive Session liefert genau der ausgewählte
`sched.get_queued_cards(fetch_limit=101)`-Snapshot Karten und native
`new_count`, `learning_count`, `review_count`. Sein `finally` stellt den vorherigen
Scope wieder her. Das Antwortlimit betrifft ausschließlich die Kartenliste.

Für die Decktabelle ist der Default ein einziger offizieller
`sched.deck_due_tree()`-Abruf innerhalb einer Collection. Die installierte API
(`anki/scheduler/base.py:76–82`) liefert einen gebündelten Baum; `DeckTreeNode`
beschreibt Counts nach Unterdecks/Tageslimits sowie `total_including_children`
(`anki/decks_pb2.pyi:366–377`). Die Tabelle zeigt diese Deckübersicht, die Session
ihre tatsächlich gewählte Queueprojektion. Gather/Burying oder wartende Lernkarten
können die beiden Projektionen unterscheiden; keine Gleichheit durch eigene
Nachzählung erzwingen. Relevante Fälle werden mit der echten Engine geprüft.

`/stats` ergänzt je Deck `deck_id`, `counts` und `scope_cards`. Das bestehende
`cards`-Feld behält seine Bedeutung als eigener Bestand; `scope_cards` ist der
Bestand einschließlich Unterdecks. Die bestehende Deckliste bleibt zunächst bei
Decks mit eigenen Karten, verwendet für ihren gewählten Scope aber `scope_cards`
und Engine-Zähler. Leere Container erzeugen keine zusätzlichen Tabellenreihen;
ein ausdrücklich geöffneter Eltern-Scope funktioniert dennoch.

Der globale Status darf seine Zahl nicht länger aus `len(_due_ids())` ableiten.
Wurzelwerte aus der offiziellen Deckübersicht werden einmal aggregiert. Kategorien
sind Anki-Zähler; globale Texte in Study/Today/Learning werden bei Bedarf zu
„heute geplant“ präzisiert, damit Lernschritte nicht als eindeutiger Kartenbestand
erscheinen. Tageslimit null ist ein gültiger Enginezustand, kein Defekt.

Default-Komplexität der Deckübersicht: ein Collection-Open, ein Deckbaum, eine
gebündelte Bestands-/Reviewprojektion und O(Decks) DTO-Aufbereitung. Eine aktive
Session serialisiert höchstens 100 Karten. Ein Instrumentierungstest prüft die
Anzahl der Scheduler-/Collection-Aufrufe; keine vollständige Queue pro Deckzeile.

## Review, vorhandene Receipts und Outbox

Die aktuelle Reviewroute prüft Receipts gegen Karte/Rating (`study_api.py:303–310`)
und wählt anschließend `card.did` (`:321`) ohne Restore. Die UI sendet alle
Bewertungen über die haltbare Outbox mit `offline:true` (`studyQueue.ts:40–45`).
Der globale Online-Membershipcheck `:319` greift für diesen UI-Pfad nicht.

Neue Reihenfolge innerhalb des bestehenden Locks:

1. Receipt nach `review_id` lesen. Gleiche Karte/Rating: bereits angewendet
   zurückgeben, bevor Deckauflösung oder aktuelle Queue geprüft werden. Andere
   Karte/Rating: bestehender 409-Konflikt. Ein anderer oder inzwischen gelöschter
   Scope macht ein vorhandenes passendes Receipt nicht ungültig.
2. Ohne Receipt Karte laden. Offline-Zeitfenster bleibt unverändert. Optionalen
   Scope als vorhandene Anki-Deck-ID prüfen; fehlt das Feld, `card.did` wählen.
   Kein stilles Erstellen und kein Weiterlernen in einem anderen Deck bei 404.
3. Vorherigen Scope sichern, ausgewählten Scope setzen und dessen erste
   Schedulerkarte prüfen. Kartenzugehörigkeit, Fälligkeit und Reihenfolge kommen
   aus dieser Queue. Den global begrenzten Membershipcheck durch diese echte
   Scopeprüfung ersetzen; Eligibility nicht ersatzlos entfernen.
4. Vorhandenes `answerCard` und Receipt-Schreiben weiterverwenden, Auswahl im
   `finally` wiederherstellen. FSRS, Writer/Generation, Bewertungs-UUID sowie
   Zuordnung zur UniOS-Historie behalten ihre vorhandene Semantik.

`unios_review_receipts` erhält keine neue Spalte. Der bestehende Receipt-Schlüssel
bleibt gültig; gleiche Bewertung mit geändertem Scope muss nach Anwendung als
Replay funktionieren. Die Body-Validierung für ein syntaktisch ungültiges neues
Feld bleibt trotzdem 422. Ein noch nicht angewendeter Review benötigt einen
gültigen Scope und darf bei Reihenfolgeänderung weiterhin 409 liefern.

`PendingReview.study_deck_id?: number` wird nur bei neuen scoped Sessions aus der
Serverantwort gesetzt. Bestehende IDB-Einträge ohne Feld bleiben lesbar; Store,
KEY, UUID, Reihenfolge, koaleszierte Flushes und Bestätigung nur der eigenen UUID
bleiben erhalten. Die vorläufige ts-fsrs-Schätzung bleibt vorläufig. Eine neue
Session darf aus einem Server-/Scopefehler keine erfolgreiche Bewertung ableiten.

## Frontend, Cache und Sitzungserhalt

- `StudySessionPage.tsx`: Query mit `encodeURIComponent(deck)` aufbauen; returned
  Scope-ID beim Bewerten weiterreichen. Den exakten Karten-Deckfilter entfernen.
  Session beim ersten erfolgreichen Snapshot einfrieren, einschließlich Scope,
  `has_more` und Counts; Sync/Refetch darf Fortschritt oder Antwortzustand nicht
  zurücksetzen. Deckwechsel erhält getrennte bestehende Workspace-Schlüssel.
- `StudyPage.tsx`: Engine-Zähler aus Deckmetadaten verwenden; `dueByDeck` aus dem
  globalen 100er-Fenster entfernen. Unterdeckumfang und begrenzte Sitzung klar
  bezeichnen. Weitere Sitzung ausdrücklich neu starten; keine stille Verlängerung
  einer abgeschlossenen eingefrorenen Queue.
- `studyQueue.ts`: optionalen Scope in `queueReview` und PendingReview ergänzen.
  Allgemeine Offline-/Runtime-/Lease-Prüfungen nicht ändern.
- `StudySync.tsx`: eine gemeinsame eng begrenzte Invalidierung für Status, Stats
  und alle `/api/anki/study/due`-URLs verwenden. TanStack vergleicht den ganzen
  URL-String als zweites Key-Element; `['api', '/due']` invalidiert Queryvarianten
  nicht automatisch. Predicate nur für diese Study-Pfade, keine globale
  Cacheleerung. Nach erfolgreichem Review-Replay alle vorhandenen scoped Reads
  invalidieren; eingefrorene Session bleibt bestehen.
- `api.ts`/`offlineCache.ts`/`readFreshness.ts`: volle URL als Query-Key erhalten,
  keine Daten eines anderen Decks als Placeholder. Scoped due ist bereits auf
  der Cache-Allowlist, Freshness trennt schon am `?`. Stats als erlaubten Study-
  Read ergänzen, damit Deckmetadaten beim Offline-Neustart verfügbar bleiben.
  Cacheidentität und Laufzeitprüfung des verbundenen Servers unverändert lassen.

Default für Offline: erfolgreich geladene scoped Queues persistieren; globaler
Tages-Prefetch bleibt erhalten. Besucht der Nutzer ein ungecached Deck offline,
zeigt die UI „Dieses Deck ist offline noch nicht gespeichert“ mit Verbindungsweg.
Sie erklärt es nicht für leer und widmet keinen globalen Teilbestand heimlich in
eine vollständige scoped Queue um. Dieses P1-Paket erweitert den Tages-Prefetch
nicht zu einem vollständigen Download aller Decks; Downloadumfang und Cachealter
bleiben erkennbar. Besuchtes Deck → offline → Neustart ist gezielt abzunehmen.

Bei `has_more` heißt der Abschluss „Diese Sitzung abgeschlossen“ und bietet eine
bewusste weitere Sitzung nach erneutem scoped Abruf. „Deck geschafft“ setzt keinen
globalen 100er-Download mit dem gesamten Stoff gleich. Neue Texte laufen über
de/en-Study-i18n; Reader-Locales bleiben außerhalb dieses Pakets.

## Contract und konkrete Implementierungsfolge

Der aktuelle `frontend/openapi.json:17262–17276` besitzt keine Deckquery und nur
eine leere Antwortschema-Definition; `api.d.ts:12682–12700` liefert `unknown`.

1. Neue typed DTOs für Counts, Scope, Due-Antwort und ergänzte Stats-Deckfelder;
   kleinen Repository-/Service-Pfad für GET und Review aufbauen. Bestehende
   HTML-/FSRS-Kartendarstellung gemeinsam verwenden. Optionales Reviewfeld und
   Receipt-Replay-Reihenfolge implementieren, nicht Receipt-Schema ändern.
2. Echte synthetische Anki-Regressionen für Scope, Limits, Restore und Replay
   ergänzen; Backend-Fehlerfälle verifizieren, bevor UI-Zählung darauf aufbaut.
3. Deckliste, Session, Outbox und eng begrenzte Invalidierung umstellen; optionales
   Feld abwärtskompatibel lesen. Lokale Session nicht durch Refetch ersetzen.
4. Isolierten OpenAPI-Export und generierte Typen erneuern; bestehende lokalen
   StudyCard-Duplikate durch gemeinsame Contracttypen ersetzen. `api:check`
   ausführen; Beispiele/Fehlerantworten schließen 404/409/422 ein.
5. i18n und gezielte Frontend-/Browserfälle abnehmen. Erst nach grünem Paket den
   üblichen Build und die gemeinsame Integration durch den Hauptagenten starten.

## Abnahme und vorhandene Testgrundlage

Vorhanden: `tests/test_anki_study.py` prüft Einzelkarten-Review/Receipt, Package-
Roundtrip, Moduswechsel und Snapshot-/Reviewhistorie; `tests/test_demo.py` prüft
einen Demo-Review. `frontend/e2e/study-mode.spec.ts` prüft zwei Karten eines Decks
mit Offline-Replay. `studyQueue.test.ts` sichert Haltbarkeit, Serialisierung,
Runtime-Prüfung und gleichzeitige Flushes. Kein vorhandener Fall prüft die
Mehrdeck-/100er-Grenze oder den ausgewählten Elternkontext.

Gezielte neue Fälle in `tests/test_anki_study_scope.py`, Session-/Queue-Vitest und
`frontend/e2e/study-deck-scope.spec.ts`:

1. **Echte Anki-Collection: 101 frühe Karten in A + 1 Karte in B.** Für alle
   beteiligten Decks explizit ausreichende Tageslimits setzen; Gather/Sort auf
   deterministische Reihenfolge konfigurieren. Keine 102 neuen Karten mit dem
   Standardlimit 20 als vermeintliche Grenzregression. A liefert maximal 100 mit
   `has_more`; scoped B liefert seine Karte und B-Zähler sind positiv.
2. Dieselbe Grenze unter `Uni::A`/`Uni::B`; `Uni` enthält beide Unterdecks,
   `Uni::B` keine A-Karte, ähnlicher Name `Uni::BB` zählt nicht zu B. Scope-ID ist
   die gewählte Eltern-ID; Karten behalten ihr tatsächliches Unterdeck.
3. Tageslimit null/niedrig, Unterdecklimit, `Limits Start From Top` an/aus und
   Gather-/Sort-Unterschiede: Queue und Zähler bleiben Engine-Ausgaben. Suspended/
   buried Karten werden nicht durch eigene Bestandslogik lernbar gemacht.
4. Bekanntes leeres Deck liefert ein gültiges leeres Fenster. Unbekannter Name/
   Scope wird abgewiesen und erzeugt kein Deck. Sonderzeichen/Unicode bleiben
   kanonisch; Query-/Review-Grenzen liefern 422 statt unbounded Eingaben.
5. Vorherige Auswahl nach scoped GET, Review, Scheduler-/Serialisierungsfehler
   und Reihenfolgekonflikt unverändert. Repositories öffnen die Collection pro
   Operation einmal; Stats verwenden den gebündelten Deckbaum.
6. Parent-Session mit anders konfiguriertem Unterdeck bewertet im Parentkontext.
   Bestands-Outbox ohne Scope funktioniert weiter. Passendes Receipt mit anderem
   oder inzwischen gelöschtem Scope bleibt Replay; Karte/Rating-Konflikt bleibt
   409. Keine zweite Anki-/UniOS-Historie bei Wiederholung.
7. Session B lädt ihren URL-Key, Deckwechsel zeigt keine A-Placeholderdaten.
   Refetch/Reconnect invalidiert scoped Keys, verändert aber die eingefrorene
   Session nicht. Begrenzter Abschluss bietet weitere Sitzung ausdrücklich an.
8. Scoped Deck online laden → offline bewerten → neu laden → reconnect/replay:
   Cache und Outbox bleiben erhalten. Ungecached Deck offline wird als nicht
   gespeichert bezeichnet; nie als fachlich leer. Vorhandener Runtime-/Standby-
   Schutz sperrt Mutation weiter, GET-Authentifizierung bleibt unverändert.

Prüfreihenfolge bei Umsetzung: betroffene pytest/Vitest, Ruff, mypy, Typecheck,
Lint, i18n und OpenAPI-Abgleich; ein Build und fokussierte Browserabnahme. Bestehende
Anki-/Offline-Tests mitlaufen lassen. Volle Integration folgt gemäß AGENTS, mit
synthetischen Fixtures und ohne Migration oder Lesen eines echten Bestands.
