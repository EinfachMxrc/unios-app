<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Eigene Lernkarten aus PDF-Quellen: Umsetzungsplan

Stand: 07.10.2026. **Lokal implementiert.** Der folgende ursprüngliche Plan
dokumentiert den Vertrag und die Befunde vor der Umsetzung. Aktuelle Änderungen,
Abnahme und verbleibende Geräteprüfungen stehen in
[qa/manual-source-cards-20261007/README.md](qa/manual-source-cards-20261007/README.md).
Die additive Migration und alle Abläufe verwenden ausschließlich synthetische
Bestände. Vor jeder Migration am echten Bestand erstellt Marc einen geprüften
Snapshot; dieser Plan erteilt keine Freigabe für eine Live-Migration.

## 1. Nutzer-Painpoint und kritische Szenarien

Ein Student markiert 40 Konzepte in einem 120-seitigen Skript. Reader-Recall kann
die Zitate aufdecken, speichert aber keine dauerhafte Karte oder Bewertung
(`frontend/src/pages/material/ReaderStudyTools.tsx:218–265`). Der direkte Übergang
zu einer selbst geschriebenen, nach FSRS wiederholten Karte fehlt.

- **Neue Skriptversion:** Der Student erstellt eine Karte aus V1/Seite 12.
  Später wandert die Markierung nach V2/Seite 17. Die Karte muss weiterhin genau
  V1/12 und das ursprüngliche Zitat öffnen. Ein Link zur aktuellen Markierung
  verändert die Bedeutung ihrer Quelle.
- **Verlorene Speicherantwort:** Ein Klick wird gespeichert, danach bricht die
  Verbindung ab; alternativ endet der Host zwischen Anki-Erstellung und SQL-Ack.
  Erneutes Speichern und Neustart dürfen keine zweite Karte erzeugen.
- **Ohne KI oder geschlossenes Anki Desktop:** Der Student schreibt seine eigene
  Frage/Antwort. Das braucht keine KI-Freigabe. Eine bestätigte Karte bleibt bei
  fehlender Anki-Verbindung dauerhaft gespeichert und sichtbar ausstehend.

Der erste Schnitt beginnt ausschließlich an einer bereits gespeicherten
Reader-Markierung. Rohe PDF-Auswahl, ausstehende Offline-Markierungen, Notizblöcke
und Sammelerstellung sind spätere Anschlüsse. Kursfragen führen zunächst zum
Reader: `app/material/api.py:108–113` liefert dort teilweise eine neueste
`version_id` zusammen mit der ursprünglichen `source_page`; dieser Kontext ist
keine sichere unmittelbare Erstellquelle.

## 2. Komponenten- und Speicherlogik

Eine gemeinsame `ManualCardDialog`-Komponente öffnet sich über „Als Lernkarte“
in `ReaderParts.AnnotationRow` und `ReaderRecall`. Sie enthält Frage, Antwort und
Thema. Das Zitat belegt die Antwort vor; ein eigener Markierungskommentar kann
die Frage vorbelegen. Die Frage muss bewusst formuliert/bestätigt werden.
Quelle, Version, Seite und Originalzitat stehen daneben unveränderlich sichtbar.
Keine KI-Erklärung oder automatisch erzeugte Antwort als eigene Eingabe vorbelegen.
Der Dialog nennt die tatsächliche Ablage `Uni::{course}`: ein Thema ist beim
bestehenden Transfer ein Tag und erzeugt keinen Unterstapel.

„Speichern & freigeben“ bestätigt den vollständig angezeigten eigenen Inhalt.
Dieser ausdrückliche Nutzerschritt erzeugt eine freigegebene Basic-Karte;
es gibt kein automatisches Freigeben von KI-Vorschlägen. Ein lokaler Entwurf
behält seine UUID und den letzten abgesendeten Snapshot bei unklarer Antwort.
Erneutes Senden verwendet identischen Inhalt und dieselbe UUID. Neuer Inhalt
unter derselben bereits verwendeten UUID ergibt einen sichtbaren Konflikt.
Entwurf erst nach sicherem Erfolg und nur bei passendem Entwurfsstand entfernen.

Offline darf der Nutzer den lokalen Entwurf bearbeiten. Server-Speichern bleibt
deaktiviert; kein neuer automatischer Erstell-Outbox-Weg. Das entspricht den
Schreibgrenzen in `BAUAUFTRAG.md:494`. Lokale Speicherfehler sichtbar anzeigen;
keine behauptete Sicherung und kein Verwerfen beim Schließen des Dialogs.

Die Karte friert **die gerade geöffnete `MaterialView.version_id`** und den
validierten `display().anchor.page` samt Zitat ein. Nicht blind
`annotation.source_version_id` übernehmen: Reanchor ändert diese ID
(`app/material/service.py:274–296`), während `display()` historische Zitate und
Seiten mit einer aktuellen Annotation-Revision liefern kann (`:330–347`).
Quellenlink: `/material/{frozen_version_id}?page={frozen_page}`. Die eingefrorene
Seite darf nicht durch einen Hash-Link zur veränderlichen Markierung ersetzt werden.

Status nach dauerhaftem SQL-Speichern: `approved`, also „Gespeichert, Übernahme
ausstehend“. Erst bestätigte Anki-Übernahme: `pushed`. Im integrierten Modus kann
die gezielte Übernahme unmittelbar erfolgen; im externen Modus übernimmt der
bestehende Desktop-Agent. Ein Transferfehler löscht die gespeicherte Karte nicht.
Anki-Tageslimits bleiben maßgeblich; „übernommen“ bedeutet nicht „sofort fällig“.

## 3. Konkreter Code- und Vertragsschnitt

**Migration ist nötig.** `AnkiCardQueue` enthält derzeit nur ID, Ressource,
Status, Payload und Thema (`app/db/models.py:693–699`). `enqueue_cards()` prüft
die Importversion, speichert sie aber nicht (`app/anki/api.py:145–176`).
Vier additive Felder reichen als Ausgangsschnitt:

| Feld | Vertrag |
| --- | --- |
| `origin` | Server setzt `manual` oder `ai`; Bestandszeilen erhalten `ai`. |
| `mutation_id` | Nullable, Unique; manuelle Einträge erfordern eine UUID. |
| `source_version_id` | Nullable FK auf die eingefrorene `ResourceVersion`. |
| `source_snapshot` | Unveränderliches, validiertes JSON der Quellenposition. |

Der Snapshot enthält Annotation-ID/-Revision, angezeigte Version, Dateihash,
Seite, Zitat sowie Ressourcen-Quellidentität. Persistierter ursprünglicher
Karteninhalt und Request-Quellenfelder ermöglichen einen kanonischen
Idempotenzvergleich ohne aktuelle Quellen erneut auszuwerten. Bestandskarten
ohne bekannte Version erhalten keinen erfundenen Ursprung oder Latest-Backfill.

1. Neue `app/anki/manual_api.py`, `manual_service.py`, `manual_repository.py`
   und zweckmäßige Schemas: `POST /api/anki/manual-cards` mit `mutation_id`,
   `front`, `back`, `topic` und `source {version_id, annotation_id,
   expected_revision, page}`. Begrenzte, nicht leere Inhalte; zunächst nur Basic.
   `origin`, `generated_by` oder KI-`confidence` sind keine Client-Auswahlfelder.
   Kurs, Herkunft, Zitat und Hash leitet der Server aus gültigen Quellen ab.
2. API validiert HTTP/DTO und ruft `coordinator.assert_writer()`; bestehende
   Session-, Dashboard-, Lease-Generation- und Übergabegates bleiben aktiv
   (`app/main.py:401–424,459–501`). Service prüft Fachregeln, Repository liest
   und schreibt Daten. Erst die **Mutationskennung nachschlagen**, dann bei einer
   neuen Mutation Ressource, Version, Annotation, Revision und eindeutigen Anker
   prüfen. Fremde Quellen/`other_group` abweisen. Nicht auf KI-Allowlist prüfen.
   Gemeinsamen Ressourcenlock für Refresh, anschließende Revisionsprüfung und
   Quellen-Snapshot verwenden: `display()` kann den ORM-Eintrag erneut laden.
   Ein paralleles Reanchor darf keinen bereits geprüften Stand austauschen.
   Den Quellenlock vor einem Anki-Transfer wieder freigeben.
3. Gleiches UUID-/Inhaltspaar liefert denselben Queue-/Notizbezug; geänderter
   Inhalt ergibt 409. Erfolgreiche Replays funktionieren auch nach späterer
   Markierungsänderung/-löschung. Die Unique-Constraint sichert konkurrierende
   Wiederholungen; kein eigener Receipt-Eintrag ohne zugehörige Queue-Zeile.
   Payload und Quellen-Snapshot atomar speichern, Thema mit `resolve_topic()`
   verbinden. Die Erstellmutation verändert keine vorhandenen Anki-Reviews.
4. Gemeinsamen gespeicherten Karteninhalt aus `CardProposal` lösen:
   Transport/Übernahme verwenden die gemeinsamen Inhaltsfelder; das KI-Importschema
   verlangt weiterhin seine KI-Metadaten. Für manuelle Karten keine erfundene
   `confidence` erzeugen. KI-Import, CLI, Outbox und MCP setzen ausschließlich
   `origin=ai`; kein Umkennzeichnen vorhandener Vorschläge. KI-Allowlist und
   Kandidatenlimit bleiben für diese Wege wirksam. Die Budgetquery in
   `enqueue_cards()` zählt `origin=ai` statt auch eigener Karten.
   Gemischte Queue-Reads und Sammeltransfer müssen gemeinsame gespeicherte
   Inhalte lesen können: heutige `CardProposal`-Pflichtfelder wie `confidence`
   dürfen eine manuelle Zeile nicht zur Störung der gesamten Queue machen.
5. Bestehende Übernahme aus `app/anki/study_api.py:165–192` klein zu einem
   gezielten Transfer-Service mit Repository extrahieren. **Nur den konkreten
   Queue-Eintrag übernehmen**, nicht `/approved` für alle freigegebenen Karten
   auslösen. Die bestehende Sammelroute behält ihren Vertrag.
   `add_approved_note()` (`app/anki/collection.py:131–154`) und
   `clients/anki_agent/__main__.py:82–106` weiterverwenden: neue manuelle Karten
   bekommen denselben GUID-basierten `UniOSId` in beiden Modi. Alte Queue-Marker
   und Agent-Tags bleiben kompatibel. Nach Absturz zuerst nach GUID suchen,
   danach fehlendes SQL-Ack ergänzen; mehrere GUID-Treffer sind ein Konflikt.
   Der alte Desktop-Agent ignoriert zusätzliche DTO-Felder und identifiziert
   Karten nur über Queue-ID/Tag. Manuelle Karten daher erst an einen Agenten
   mit ausdrücklich angekündigter `manual-guid-v1`-Unterstützung ausliefern;
   alte Agenten erhalten weiter bisherige KI-Karten. Eigene Karten bleiben bis
   zum Agent-Update sichtbar gespeichert und zur Übernahme ausstehend.
6. `StudyCard` um nullable Quellenmetadaten ergänzen; Herkunft gebündelt über
   stabile GUID-/Queue-Zuordnung laden, keine HTTP-/SQL-Abfrage pro Karte.
   Native Anki-IDs allein genügen nach Import/Moduswechsel nicht als Ursprung.
   Bestehende `AnkiCard`-/`AnkiReview`-Zuordnung, Kurs-/Thementags, offizielles FSRS
   und Review-Outbox weiterverwenden. Unzuordenbare importierte Karten zeigen
   keine behauptete Quelle. „Quelle öffnen“ in `StudySessionPage` ergänzen.
7. Frontend in Reader/Recall, Dialog-/Entwurfsmodul, Kartenqueue und Lernsession;
   Texte de/en, OpenAPI und generierte Typen aktualisieren. Nach Erstellung/
   Übernahme Queue, Kartenbrowser, Status, Stats und alle scoped Due-Caches
   invalidieren. Bereits laufende Sessions behalten ihre eingefrorene Queue.

Die vorhandenen `UniOS Basic`-Notiztypen besitzen bereits `UniOSId`; dafür braucht
es keinen Ersatztyp oder nachgebauten Scheduler. SQL und Anki sind keine gemeinsame
Transaktion: durable Queue plus GUID und wiederholbarer gezielter Transfer bilden
deshalb die Wiederaufnahme. Antwort meldet stets den tatsächlichen Übernahmestatus.

Manuelle Frage/Antwort sind Klartext. Integrierte Übernahme und Desktop-Agent
brauchen denselben Vertrag für HTML-Escaping und Zeilenumbrüche: heute schreibt
`add_approved_note()` roh, während der Agent escapet und `<br>` erzeugt. Eine
eigene Eingabe wie `<T>`, `&` oder eine zweite Zeile muss in beiden Modi gleich
erscheinen und darf auch im exportierten Anki-Paket kein ausführbares HTML sein.
Vorhandene KI-Kartenformate werden dabei nicht stillschweigend umgedeutet.

## 4. Abnahmekriterien und Prüfgrenze

- Synthetisches PDF V1/12 → Markierung → eigene Karte → reale Anki-Session →
  Bewertung → Neustart. Inhalt, GUID, Quelle und FSRS-Historie bleiben erhalten.
  Reanchor nach V2/17 oder Löschen der Markierung verändert die Karte nicht.
- Verlorene HTTP-Antwort sowie Prozessende zwischen Anki-Erstellung und SQL-Ack:
  identischer GUID-Retry erzeugt genau eine Queue-Zeile und eine Anki-Notiz.
  Auch parallele Wiederholung bleibt eindeutig; anderer Inhalt unter derselben
  UUID wird abgewiesen. Erfolgreicher Retry erfordert keinen aktuellen Anker.
- Neue Speicherung mit veralteter Annotation-Revision, fremder Version,
  unpassender Seite oder uneindeutigem Anker wird sichtbar abgewiesen.
  Standby-/ungekoppelte Clients können nicht schreiben. HTML/Sonderzeichen in
  eigenen Fragen bleiben sichere Inhalte, keine ausführbaren Templates.
- Bei deaktivierter KI und gesperrter KI-Kursfreigabe eigene Karte erstellen;
  16 manuelle Karten verbrauchen kein KI-Vorschlagsbudget. Dieselben KI-Import-
  und MCP-Requests bleiben gesperrt/limitiert und können keine Herkunft wählen.
- Beide Modi: geschlossenes Desktop-Anki zeigt dauerhaft ausstehende Übernahme;
  Agent-Ack oder integrierter Transfer meldet erst danach `pushed`. Nur die
  ausgewählte Karte wird übertragen. Tageslimits und bestehende Reviews bleiben.
- Neustart, `.apkg`-Moduswechsel und gemeinsamer Host-Snapshot erhalten die
  Quellenzuordnung per GUID;
  Paket ohne passende Quellenmetadaten meldet unbekannte Quelle. Offline nur
  Entwurf, kein stilles Serverspeichern. Cache-Refresh setzt keine Session zurück.

Die Umsetzung prüft diesen Vertrag mit echten temporären Anki-Collections,
synthetischen Migration-/Agent-/Guard-Tests, Vitest für Dialog/UUID/Entwurfszustand
und Browserabläufen mit V1/12 → V2/17. Tatsächliche Resultate der Gesamtläufe,
Ruff/mypy/TypeScript/i18n/OpenAPI und Screenshots stehen im aktuellen QA-Bericht.
Die ursprüngliche lesende Planerstellung hatte diese Prüfungen nicht ausgeführt.
