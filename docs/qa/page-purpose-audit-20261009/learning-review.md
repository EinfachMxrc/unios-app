<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Produktreview des Lernbereichs

Stand: UniOS 0.1.22, Quellrevision `05e56cfad86b110e2d1be505adad2b58e3ab6d2a`, 09.10.2026.
Untersucht wurden Produktcode und erfundene QA-Profile. Es wurden keine privaten
Dokumente gelesen, keine Produktdateien verändert und keine eigenen Browserdienste
oder Tests gestartet. Die gemeinsamen Zustandsregeln stehen in
[state-map.md](state-map.md); der isolierte Routenlauf stammt vom Hauptagenten.

Die visuelle Basis ist bereits ruhig und gut lesbar. Die wichtigste Verbesserung
ist ein eindeutiger Arbeitsweg vom Material über die Freigabe zur Übung. Derzeit
verteilt sich dieser Weg auf mehrere Seiten mit ähnlichen Namen; umfangreiche
Bestände werden vollständig als lange Listen und teilweise als Formularhistorie
angezeigt. Außerdem können alte Speicherbestätigungen neuere Eingaben verwerfen.

## Beleggrenzen

- **Codebefund:** Der beschriebene Ablauf lässt sich aus konkreten Zuständen,
  Setter-Aufrufen und API-Verträgen ableiten. Ein eigener Lauf wird damit nicht behauptet.
- **Browserbeleg:** Ein Messwert oder Zustand ist in `browser-walk.json` bzw.
  den zugehörigen Screenshots des gemeinsamen synthetischen Laufs vorhanden.
- **Designurteil:** Ein sinnvoller Umbau für das simulierte Nutzungsszenario,
  kein Beweis einer defekten fachlichen Funktion.

Der Routenlauf hat ausdrücklich alle Module zur Inspektion aktiviert. Die
Standardnavigation besitzt fünf Hauptwege; KI ist standardmäßig ausgeschaltet.
Die Menge optionaler Seiten wird daher nicht als standardmäßig überladene Sidebar
bewertet. `screenshots/studySession-detail-1440.png` zeigt einen im aktuellen
synthetischen Profil nicht vorhandenen Decknamen. Es belegt den Fehlerzustand,
keinen kaputten normalen Sessionstart. Der ergänzte Record `normal-study-session`
in `behavior-probes.json` bestätigt einen erfolgreichen Einstieg mit dem tatsächlichen
Decknamen. Die neuen Bilder `screenshots/study-session-valid-1440.png` und
`screenshots/study-session-valid-390.png` zeigen die laufende Session. Der
zugängliche Name des Reveal-Buttons enthält zusätzlich „Leertaste“; ein älterer
exakter Textselektor ohne dieses Kürzel war daher kein Funktionsfehler.

## Simulierte Nutzung vor den Vorschlägen

| Situation | Ziel des Nutzers | Bestehender Weg und Reibung |
| --- | --- | --- |
| Nach einer Vorlesung mit einem 120-seitigen Skript | Zu Seite 12 zurückkehren, eine offene Frage klären und zwei Aufgaben selbst beantworten | Quellenlinks und freigegebene Erklärungen sind vorhanden. Aufgaben werden aber im Überblick beantwortet, unter „Üben“ in einer zweiten Bibliothek bearbeitet und unter „Übungsaufgaben“ als Vorschläge geprüft. Das verlangt Kenntnis der Implementierung. |
| Eine falsch formulierte Lernkarte fällt beim Wiederholen auf | Quelle prüfen, Inhalt korrigieren und weiterlernen | Die Session verlinkt die Quelle und besitzt zuverlässiges Bewertungs-Undo. Die integrierte Kartenverwaltung zeigt dagegen höchstens 200 global abgefragte Karten ohne Suchfeld; schnelle Korrekturen können während eines Speicher-ACKs verloren gehen. Inhaltskorrektur und falsche Bewertung sind unterschiedliche Vorgänge. |
| Vier Tage vor der Klausur, mehrere Fächer und 200 Aufgaben | Lücken auswählen und eine kleine, nachvollziehbare Übungsrunde starten | Der nächste Lernauftrag trägt Kurskontext. Im allgemeinen Überblick erscheinen trotzdem 200 Aufgaben aus einem anderen Fach. Die lange Liste drängt offene Fragen und Planung weit nach unten. Messwerte bleiben korrekt unbekannt; ihnen fehlt ein konkreter nächster Übungsweg. |
| Informatik im ersten Semester auf dem Laptop | Python tippen, speichern, Tests starten, während Wartezeiten weiterdenken | Echte Runner-Tests, Vorlagen und lokaler Entwurf sind wertvoll. Beim Tippen während einer verzögerten Speicherantwort bestätigt die UI jedoch möglicherweise den falschen Text als gespeichert und löscht die neuere lokale Sicherung. |

## Entscheidung je Seite

| Seite / Route | Klarer Zweck | Entscheidung |
| --- | --- | --- |
| LearningPage `/learning` | Weiterlernen, offene Fragen und passende nächste Arbeit wählen | **Behalten**, als kompakter Einstieg; umfangreiche Aufgabenbibliothek auslagern |
| StudyPage `/study` | Einen Anki-Stapel wählen und Karten finden/korrigieren | **Behalten**, Lernen und Verwaltung klar gliedern |
| StudySessionPage `/study/session/:deck` | Eine stabile Kartenrunde ohne Ablenkung beantworten | **Behalten**, Fokus und Tastaturfluss schützen |
| CardQueuePage `/anki` | KI-Kartenvorschläge redaktionell prüfen | **Kontextuell**, in einer gemeinsamen Vorschlagsprüfung |
| CardQueuePage `manualOnly`, `/study/cards` | Bewusst erstellte eigene Karten und ihren Transfer verfolgen | **Behalten, kontextuell** unter Karteikarten; kein KI-Importformular |
| ExercisePage `/exercises` | Übungsvorschläge prüfen und entscheiden | **Zusammenführen** als Typ „Übungsvorschläge“ in der Vorschlagsprüfung |
| ExplanationPage `/explanations` | Antworten auf konkrete offene Fragen prüfen | **Kontextuell**, bevorzugt an der Frage und in derselben Vorschlagsprüfung |
| AssessmentPage `/assessment` | Aufgaben beantworten, echte Prüfer nutzen und eine Probeklausur durchführen | **Behalten**, zum gemeinsamen Ort „Üben“ ausbauen |
| CodingPage `/coding` | Ein begrenztes Programmierlernziel mit echten Tests üben | **Behalten**, für passende Kurse; andere Studiengänge können es ausblenden |
| AnalyticsPage `/analytics` | Erfasste Arbeit und gemessene Lücken wöchentlich prüfen | **Optionaler Rückblick**, im Lernbereich verlinkt |
| AiPage `/ai` | Freigaben und KI-Pakete/Verbindungen einrichten | **Optionales Werkzeug**, kursbezogene Aktionen statt täglichem Hauptweg |

„Zusammenführen“ betrifft die Navigation und wiederverwendbare UI. Quellen,
fachliche IDs, Statusmaschinen, Prüfer und Freigabeverträge bleiben getrennt.

## Lokale Zustände und konkrete Clickpaths

Diese Karte ergänzt die globale StateMap. Ein erfolgreicher ACK darf nur den
tatsächlich gesendeten Entwurf quittieren.

| Bereich | Lokaler Eigentümer | Aktion → Effekt | Grenze beim Reset / ACK |
| --- | --- | --- | --- |
| CodingWorkspace | `files`, `revision`, `dirty`, aktiver Dateiname, Recovery in localStorage; `CodingPage.tsx:84` | Tippen → Dateien ersetzen, `dirty=true`, Recovery schreiben (`105`); Speichern → POST des aktuellen Closures → Serverrevision übernehmen, `dirty=false`, Recovery löschen (`110`) | Der ACK besitzt derzeit keinen Vergleich mit einem neueren Edit. Der Dateiname ist nur UI-Zustand; er darf keine Dateien zurücksetzen. |
| StudyPage-Karteneditor | `editing`, `front`, `back`; `StudyPage.tsx:48` | Karte öffnen → lokale Felder setzen (`272`); Speichern → PUT → `editing=null` und neu lesen (`161`) | Textfelder und andere Edit-Buttons bleiben während PUT bedienbar. Der ACK kann den inzwischen anderen/neuen Draft schließen. |
| KI-Kartenvorschläge | Pro Zeile `front/back/topic`, Mutation-pending; `CardQueuePage.tsx:28` | Einzelentscheidung → PUT mit sichtbarem Draft (`31`); globale Entscheidung → POST ausschließlich der IDs (`124`) | Parent kennt die Zeilenentwürfe nicht. Einzel- und Sammelfreigabe haben unterschiedliche Inhaltsgrundlagen. |
| Eigene Karten | Serverobjekt plus lokales Transferergebnis; `CardQueuePage.tsx:197` | Quellenkarte öffnen → gültige ID aus Hash; fehlendes Listenelement gezielt nachladen (`202`) → Scroll/Fokus erst bei vorhandenem Ziel (`216`) | Der direkte Link funktioniert bereits jenseits des neuesten Listenfensters. Diese Regel erhalten. |
| Offene Fragen / Erklärungen | `learning:resolved` im UI-Store; Frage mit Serverrevision; `LearningPage.tsx:39` | Erklärunglink `?all=1#question-id` → Learning-Fallback „alle“; vorhandener Storewert hat Vorrang → Fragen filtern (`42`) | Ein gespeichertes `false` versteckt die adressierte gelöste Frage. Der Hash alleine erzeugt kein DOM-Ziel. |
| Einfache Übungsrunde | kurs-/arbeitsplatzgebundener `activeId`, Antwort, Zeit, Lösungssicht, Fehlerart; `PracticePanel.tsx:26` | Start → Antwort und Lösungssicht zurücksetzen (`44`); Antwort vergleichen → Ergebnis speichern → aktives Item schließen (`53`) | Antworten sind während des Speicherns gesperrt. Keine pauschale Übertragung des Coding-Fehlers auf diesen Ablauf. |
| Assessment | Auswahl der Aufgaben und Kursfilter; pro Task/Exam Antwort, Schritte, Reihenfolge, Zuordnung; `AssessmentPage.tsx:28`, `95` | Aufgabe öffnen → eigene Antwortfelder; Abgabe → gebundene Task/Exam-ID; Prüfungsmodus sperrt bereits abgegebene Antworten (`104`) | `persist:false` ist bewusst kein dauerhafter Dokumententwurf. Unsichtbare Auswahl beim Kurswechsel muss sichtbar erklärt oder ausdrücklich aufgehoben werden. |
| Kartensession | eingefrorene Auswahl, beantwortete IDs, konkrete letzte Bewertung; `StudySessionPage.tsx` | Space/Enter → Antwort; 1–4 → konkrete UUID-Bewertung; Z → Rücknahme derselben Bewertung; Neustart erst nach Upload | Keine neue Kartenauswahl durch normale Read-ACKs; keine pauschale Rücknahme „letzte beliebige Bewertung“. |

## Belegte Fehlerpfade mit Umsetzung

### B1 — P1: Coding-Speicherantwort löscht neueren lokalen Entwurf

**Codebefund.** In `frontend/src/pages/CodingPage.tsx:110` wird Entwurf A
gesendet. Währenddessen erlaubt `CodeEditor` in Zeile `145` weiterhin Änderungen,
weil `readOnly` den `busy`-Zustand nicht berücksichtigt. Ein Edit B schreibt in
`105–108` eine neue Recovery. Anschließend setzt As ACK in `112–114` ungeprüft
`dirty=false` und löscht diese Recovery. Der Server hat A, der Editor zeigt B,
die UI meldet einen geladenen Serverentwurf; nach Neuladen fehlt B.

**Browserbestätigung am geprüften HEAD:** Der gemeinsame isolierte Lauf hat
diesen Pfad mit einer synthetischen Python-Aufgabe reproduziert. In
`behavior-probes.json`, Record **`coding-newer-edit-during-save`**, ist
`bug_reproduced: true` dokumentiert: `sent_files` und `server_files` enthalten
`STAND_A`; vor dem ACK enthält die vorhandene localStorage-Recovery
`STAND_B_WEITERGETIPPT`; nach dem ACK ist `recovery_after` leer.
`after_reload_contains_newer_edit: false` bestätigt, dass der neuere Text nach
Neuladen fehlt. Das ist ein dynamisch bestätigter Entwurfsverlust, nicht nur ein
abgeleitetes Race. B2 und B4 besitzen ebenfalls eigene Browserbelege unten.
B2a und B3 bleiben Codebefunde ohne behauptete Browserbestätigung.

**Minimaler Prüfpfad:** Python-Aufgabe „Array umdrehen“ erstellen; im Textfeld
„Quelltext bearbeiten: Solution.py“ A schreiben; POST
`/api/learning/coding/tasks/{id}/draft` serverseitig ausführen, die Erfolgsantwort
aber verzögern; „Entwurf speichern“; während der Verzögerung B ergänzen; Antwort
freigeben; localStorage, Status und Neuladen vergleichen. Für einen Run betrifft
das zusätzlich `121–125`: Der Run verwendet die Dateien des ursprünglichen
Closures, obwohl inzwischen ein anderer Text sichtbar sein kann.

**Komponentenlogik und Umsetzung:** Pro Task eine monoton steigende Editnummer
führen. Speichern bindet Task/Server, Revision, Dateien und Editnummer in einem
Snapshot. ACK übernimmt die Serverrevision; nur bei unverändertem Edit darf er
clean setzen und Recovery löschen. Bei neuerem Edit bleibt dirty bestehen und
die aktuelle Recovery erhält die neue bestätigte Basisrevision. Der Testlauf
kennzeichnet ausdrücklich den geprüften Snapshot. Ergänzend verspäteter ACK
nach Task-/Serverwechsel und Fehlerantwort prüfen. Ein generelles Tippen-Verbot
ist als alleinige Lösung unnötig; vorhandene Writer-/CAS-Prüfung bleibt erhalten.

### B2 — P1: Sammelfreigabe übernimmt andere Inhalte als im Editor sichtbar

**Codebefund.** Die Einzelzeile hält Vorderseite, Rückseite und Thema lokal
(`CardQueuePage.tsx:28–35`) und sendet sie bei Einzel-Freigabe. „Alle N freigeben“
sendet ausschließlich IDs (`124–129`, Button `177`). Der Server bestätigt den
gespeicherten Payload (`app/anki/api.py:243–258`). Korrigiert der Nutzer eine
sichtbare Zeile, speichert sie noch nicht und wählt „Alle freigeben“, wird das
Original bestätigt. Das ist keine fehlende Freigabe, sondern eine Freigabe des
falschen angezeigten Inhaltsstands.

**Browserbestätigung am geprüften HEAD:** Der Record
**`proposal-bulk-approval-ignores-visible-draft`** in `behavior-probes.json`
dokumentiert `bug_reproduced: true`. Vor der globalen Aktion ist
`visible_before` exakt „Sichtbar korrigierter Vorschlag B“. Die Sammelfreigabe
sendet ausschließlich `ids: [1]` und erhält HTTP 200; anschließend ist
`approved_front` weiterhin „Erfundener Originalvorschlag A“ bei
`approved_status: "approved"`. Damit ist die Abweichung zwischen sichtbar
korrigiertem Inhalt und tatsächlich freigegebenem Original bestätigt.
`screenshots/probe-proposal-bulk-approval.png` zeigt ergänzend den Zustand mit
einer freigegebenen Karte und keinem offenen Vorschlag. Die Grenze bei über
100 IDs (B2a) wurde dadurch nicht dynamisch geprüft.

**Prüfpfad:** Einen Vorschlag öffnen, Vorderseite ändern, direkt die globale
Freigabe klicken; GET `/api/anki/queue` muss gegen den zuvor sichtbaren Draft
verglichen werden. Der aktuelle Vertrag enthält diesen Draft nicht.

**Komponentenlogik und Umsetzung:** Begrenzte Draft-/dirty-/pending-Zustände nach
ID an einen Reviewcontroller übergeben. Sammelfreigabe zunächst bei ungesicherten
Änderungen sperren und einen verständlichen Speicherschritt anbieten. Alternativ
nach ausdrücklicher Bestätigung genau diese Änderungen revisioniert speichern
und anschließend die bestätigte Auswahl freigeben. Zeilenmutation und globale
Mutation gemeinsam koordinieren. Keine ungesicherten Änderungen automatisch
verwerfen, keine KI-Inhalte ohne bewusste Prüfung übernehmen.

**Zusätzlicher Codebefund B2a — P2:** Die Liste kann 200 Elemente liefern
(`app/anki/api.py:217`), `BulkApproval.ids` erlaubt höchstens 100 (`81–82`). Der
UI-Button sendet alle offenen IDs. Bei 101–200 offenen Vorschlägen bedeutet „Alle“
also einen ungültigen Request. Eine explizite, begrenzte Auswahl mit nachvollziehbaren
Teilbestätigungen ist besser als heimliches Chunking unter unverändertem Erfolgslabel.

### B3 — P2: Link auf gelöste Frage wird vom gespeicherten Filter überstimmt

**Codebefund.** `ExplanationPage.tsx:43` verlinkt
`/learning?all=1#question-{id}`. `LearningPage.tsx:39` verwendet denselben globalen
UI-Key unabhängig von der Query. `workspaceState.ts:39–52` bevorzugt einen
vorhandenen gültigen booleschen Wert. Nach einem früheren Besuch mit `false`
versteckt `LearningPage.tsx:42` die gelöste Zielquestion. `useAnchorScroll.ts:9–12`
findet deshalb kein Ziel.

**Prüfpfad:** Lernübersicht ohne „Geklärte Fragen“ öffnen, Frage als geklärt
markieren, aus ihrer Erklärung den Fragenlink öffnen. In derselben SPA-Sitzung
muss die konkrete Frage erscheinen und Fokus erhalten; ein falscher leerer
Zustand oder unveränderte Scrollposition erfüllt den Link nicht.

**Komponentenlogik und Umsetzung:** Eine validierte adressierte Question-ID
vorrangig sichtbar machen, unabhängig vom persönlichen Listenfilter. Möglich
ist eine kontextuelle Zielzeile „Geöffnete geklärte Frage“ oder ein temporärer
effektiver All-Filter. Nicht dauerhaft die persönliche Filterpräferenz überschreiben.
Scroll/Fokus erst nach Daten und tatsächlicher Zielvisibility auslösen; auch
gefundenes/fehlendes/deletiertes Ziel ausdrücklich unterscheiden.

### B4 — P1: Kartenkorrektur kann durch älteren Speicher-ACK verschwinden

**Codebefund.** `StudyPage.tsx:161–168` sendet Vorder-/Rückseite und schließt nach
Erfolg jeden Editor mit `setEditing(null)`. Textfelder `251–261` und die anderen
Edit-Buttons `269–278` bleiben währenddessen bedienbar. Ändert der Nutzer Text
oder öffnet Karte B, kann der ACK von Karte A diesen neueren Draft schließen.

**Browserbestätigung am geprüften HEAD:** `behavior-probes.json`, Record
**`study-card-newer-edit-during-save`**, dokumentiert `bug_reproduced: true`.
Der gesendete Vorderseitentext ist exakt „Erfundener Kartenstand A“; während des
verzögerten Erfolgs-ACKs wird „Erfundener Kartenstand B“ eingegeben. Danach ist
`editor_closed_after_ack: true`, während `server_card.front` weiterhin exakt A
enthält. Der neuere Draft B wird also geschlossen, ohne gespeichert zu werden.
Das Artefakt hält transparent fest, dass eine erste `endsWith`-Prüfung falsche
Großschreibung verwendete; die Bewertung wurde anhand der aufgezeichneten exakten
Draft-/Serverwerte neu berechnet. Der belastbare Beleg sind diese Werte und der
geschlossene Editor, nicht der ursprüngliche fehlerhafte Stringvergleich.

**Umsetzung:** Entwurf nach Karten-ID und Editgeneration besitzen; ACK bindet
die konkrete Karte und gesendete Version. Nur diese Version quittieren. Ein
anderer offener/neuerer Draft bleibt erhalten, mit Abbrechen-/Fortsetzen-Aktion.
Gezielter verzögerter PUT plus zwischenzeitlicher Edit/anderer Kartenwahl ist
die passende Regression. Eine Inhaltsänderung darf die native letzte Bewertung
weiter ehrlich unverfügbar machen; Bewertungs-Undo ist kein Ersatz für Draftschutz.

## Ausgestaltung jeder Seite

### LearningPage — kurze Startseite, kein gesamtes Semester auf einmal

**Pain Point und Beleg:** Im synthetischen Lauf besitzt `/learning` bei 1440 px
Breite eine Höhe von **27.891 px**, 205 Buttons und 212 Links. Es gibt nur einen
Fragen-Quellenlink; die Länge stammt vor allem aus 200 direkt gerenderten
Übungsaufgaben. Der angenommene Lernauftrag oben betrifft Analysis/Grenzwerte,
darunter folgt ein ganzer Bestand aus dem anderen Programmierkurs. Die allgemeine
Übersicht darf fachübergreifend sein, hilft so aber wenig beim fokussierten Start.

**Designurteil:** Im ersten Bildschirm genau ein fortsetzbares Ziel mit Kurs,
Begründung und Aktion, darunter kurze Vorschauen „Offene Fragen“ und „Passende
Übungen“. Planung/Lernstand nachgeordnet und bei leerem Bestand mit konkretem
Quelleneinstieg. Vollständige Bestände in durchsuchbaren Listen öffnen.

**Umsetzung:** `LearningPage.tsx:47–54` und `81–90` durch einen gemeinsamen
`NextLearningAction`-Datensatz mit Titel, Grund, Ziel und Scope ersetzen. Die
heutige unabhängige Titel-/Zielberechnung kann eine Themenlücke nennen, aber
allgemeine Übungen oder Karteikarten öffnen. Angenommene Blöcke/Zyklen nach
tatsächlichem Termin/Status ordnen statt dem ersten Arraytreffer. In
`PracticePanel.tsx:83` Vorschau begrenzen und „Alle Übungen“ mit erhaltenem
Kurs/Thema öffnen. `LearningStatusPanel.tsx:156` Modul-Anlage unter „Lernstruktur
bearbeiten“ legen. B3 separat beheben; ID-basierte Zielauflösung muss auch außerhalb
eines begrenzten Listenfensters funktionieren.

### StudyPage — Stapel wählen und falsche Karte schnell finden

**Pain Point:** Deckwahl und externe Integration sind sinnvoll gegliedert. Bei
inhaltlich falschen Karten fehlt aber eine schnelle gezielte Suche. Das Backend
unterstützt Anki-Suche bereits (`study_api.py:132–142`), die Oberfläche fragt
ungefiltert ab (`StudyPage.tsx:33`) und zeigt höchstens 200 Karten. Ein vorhandener
weiter entfernter Datensatz ist so nicht auffindbar.

**Konzept:** Stapelliste bleibt Start. „Karten suchen“ öffnet Verwaltung mit
ausgewähltem Deck, Text/Tag, Vorder-/Rückseitenvorschau und einer einzigen
ausdrücklichen Korrekturfläche. Externe Anki-Installation, Export und Collection-
Import bleiben im bereits vorhandenen Detailsbereich; sie müssen nicht täglich
bedient werden.

**Umsetzung:** Such-/Deckparameter in URL und Querykey binden; vorhandenes `q`
korrekt escapen/validieren. Bei Erweiterung des Ergebnisses einen begrenzten
serverseitigen Cursor einführen statt beliebig große Dumps. `240–279` durch
kontrollierten Karteneditor mit B4-Draftschutz ersetzen. Kein Serverwrite durch
Suche, keine automatische Scheduleränderung durch das Öffnen einer Karte.

### StudySessionPage — den bewährten Antwortfluss erhalten

**Pain Point:** Neue Lernende müssen wissen, ob sie etwas vergessen haben oder
ob die Karte selbst falsch ist. Die vier Bewertungslabels sind vorhanden,
erklären diese Unterscheidung aber nur begrenzt. Für Mathematik gibt es zudem
keinen expliziten Formelrender-Schritt in der Session: `317` setzt sanitisiertes
HTML ein; `lib/sanitizeCardHtml.ts` bewahrt sichere Basistags, nicht KaTeX-/MathJax-
Ausführung. Das ist ein überprüfbarer Integrationspunkt, kein Beleg, dass konkrete
private Formeln defekt sind.

**Konzept:** Fokus, große Karte, Space/Enter, 1–4 und Z beibehalten. Kleine
abrufbare Bewertungslegende „nicht gewusst / mit Mühe / sicher / sofort“;
Quellenlink und „Inhalt prüfen“ als Nebenaktionen. Formeln sicher darstellen,
mit zugänglichem Rohtext, ohne Karteikarten-Skripte freizuschalten.

**Aktueller Browserbeleg:** Der normale Sessioneinstieg ist bei 1440 und 390 px
erreicht. Die Bilder zeigen „0 von 100 Karten bearbeitet“ bei 101 neuen Karten
im Deck, eine gut lesbare Frage und den Reveal-Button mit Leertastenhinweis.
Damit ist der begrenzte, ruhige Start belegt. Dieser einzelne Probeeintrag
behauptet keinen vollständigen Durchlauf aller Karten, Bewertungen oder Undofälle.

**Umsetzung:** Tastaturlogik `222–239`, Quellenlink `319–321` und konkrete
Undoaktion `308–310` schützen. Gemeinsamen sicheren Formelrenderer nach
HTML-Sanitizing anbinden und synthetische Brüche, Vektoren und Inlineformeln
prüfen; erforderliche Render-Tags gezielt erlauben, nicht die Allowlist beliebig
öffnen. Inhaltsbearbeitung verlinkt die konkrete Karte und erhält Rückkehrkontext.
Neue Session erst nach bestätigter Queue/Freshness; keine wechselnde Kartenauswahl
bei normalen GETs.

### CardQueuePage — Prüfung und eigene Karten auseinanderhalten

**Pain Point:** KI-Vorschläge benötigen Korrektur und Entscheidung. Eigene
Karten benötigen Quelle, Zielstapel und Transferstatus. Das sind unterschiedliche
Aufgaben, trotz gemeinsamem Backend. Der `manualOnly`-Zweig trennt sie bereits
sinnvoll (`197–234`). Sein leeres Bild erklärt den Quellenweg, besitzt aber keine
direkte Aktion, um ihn wieder zu öffnen.

**Konzept:** KI-Karten in kontextueller Vorschlagsprüfung, „Eigene Lernkarten“ als
kleine Unterseite des Stapelbereichs. Bei eigener Karte Quelle und Übernahmestatus
priorisieren; Transferproblem gezielt erneut versuchen, Inhalt in der tatsächlichen
Kartenverwaltung korrigieren. Leerer Zustand führt zum zuletzt gewählten PDF/Kurs.

**Umsetzung:** B2/B2a beheben. `CardQueuePage.tsx:124` globale Auswahlzustände
einführen; entschiedene Karten `184–188` kompakt mit Details darstellen. Eigene
Karten `56–59` bewusst als gespeicherte Inhalte darstellen; Quellenguid/Transfer-
Identität nicht in frei editierbare Importobjekte umwandeln. ID-Nachladen jenseits
des Listenfensters `202–216` erhalten. Empty-Aktion `227` nutzt validierten
Recent-/Kurskontext, nicht eine erfundene neue Quelle.

### ExercisePage — ausdrücklich Vorschläge prüfen, danach üben

**Browserbeleg:** Bei 200 entschiedenen Vorschlägen misst `/exercises` **133.068 px**
Höhe und **1.002 Formularfelder**. `ExercisePage.tsx:196–197` rendert die komplette
Historie erneut als volle, deaktivierte Editoren. Die Seite heißt „Übungsaufgaben“,
zeigt aber Musterlösung und Lösungsweg sofort (`89–95`): Ihr Zweck ist Review,
nicht unbeeinflusstes Beantworten. Die Introtexte benennen diese Grenze bereits.

**Konzept:** „Übungsvorschläge“ innerhalb der gemeinsamen Vorschlagsprüfung.
Offene Vorschläge zuerst, Quellenkontext neben dem bearbeiteten Vorschlag,
bewusste Einzelentscheidung. Entschiedene Historie geschlossen, durchsuchbar und
mit kurzer Zusammenfassung. Nach Freigabe eine konkrete Aktion „Diese Aufgabe üben“.
JSON-Import bleibt ein optionales Werkzeug in Details.

**Umsetzung:** `170–197` neu ordnen; `ProposalRow` nur für den aktiv bearbeiteten
Datensatz montieren, History-Zeilen ohne deaktivierte Formularfelder. Eine
begrenzte Liste mit weiterladbaren IDs und Zielauflösung einführen. Übersetzung
und Sidebar-Label klarer benennen. Die echte Antwortfunktion in `PracticePanel`
weiterverwenden, beim Navigationsumbau in den gemeinsamen Übungsort anbinden.
Weder Übungen automatisch freigeben noch ihre Quellen-/Versionbindung verlieren.

### ExplanationPage — Antwort bei der offenen Frage beurteilen

**Pain Point:** Das synthetische Bild hat keinen offenen Review und dennoch
dominiert ein großes JSON-Importformular den ersten Bildschirm. Der Nutzer muss
vom PDF über Paket/Antwortimport/Review zurück zur Frage wechseln. Der fachliche
Wert liegt in Quelle, ursprünglicher Frage und verständlicher Antwort.

**Konzept:** Kleine Antwortprüfung direkt an der Frage oder im gemeinsamen
Vorschlagseingang. Originalzitat/Seite sichtbar, Antwort bearbeitbar,
„Antwort übernehmen“/„Verwerfen“ explizit. Erst nach Übernahme bei der Frage
anzeigen; „geklärt“ bleibt eine eigene Entscheidung. Import als Details-Fallback.

**Umsetzung:** `ExplanationPage.tsx:29–48` als wiederverwendbares Reviewelement
an die Frage hängen; Mutation `33–34` inklusive Cacheinvalidierung erhalten.
`112–130` Import nachordnen. B3 beheben. Keine automatische Änderung von
`resolved` nur weil eine KI-Antwort existiert. Mathematische Antwortvorschau über
denselben sicheren Renderer wie Notizen, Rohtext bleibt editierbar.

### AssessmentPage — gemeinsamer Übungsort mit ehrlichen Prüfgrenzen

**Pain Point:** Die Seite bietet sinnvoll acht Aufgabentypen und eine zeitlich
begrenzte Probeklausur, bildet aber eine zweite Bibliothek neben dem bereits
funktionierenden `PracticePanel`. Für symbolische Antworten fehlen hier die
Tastatur-Einfügehilfen (`AssessmentPage.tsx:119–120`); im einfachen Übungseditor
sind sie bereits vorhanden (`PracticePanel.tsx:112`). „Als Nächstes üben“ zeigt
Themenzahlen, öffnet aber keine entsprechende Aufgabe (`87`).

**Konzept:** Ein Übungsort mit Kurs/Thema/Suche; Typen „Selbst vergleichen“,
„Automatisch geprüft“ und „Tutorfeedback“ klar an jedem Item. Authoring bleibt
eingeklappt, wie bereits umgesetzt (`75`). Auswahltray vor Probeklausur zeigt
die ausgewählten Aufgaben samt Kurs, auch nach Filterwechsel. Mathematik erhält
dieselben Tastaturhilfen und eine Vorschau, passend zur tatsächlich unterstützten
Prüfgrammatik.

**Umsetzung:** Bibliothek `82–87` mit dem vorhandenen einfachen Übungsbestand
über eine UI-Adapteransicht verbinden; Fach-IDs/API-Verträge nicht verschmelzen.
`StudyInsertTools` bei `119–120` anbinden, unterstützte ASCII-Polynomsyntax von
LaTeX-Darstellung trennen. Kein uneingeschränkter LaTeX-String in einen begrenzten
symbolischen Prüfer. Nicht unterstützte Operationen ehrlich als Selbst-/Tutor-
Prüfung behandeln. Sectionrequest `60–65`, Status `74` ausdrücklich als „Für
Work vorbereitet“ mit Folgeaktion darstellen, nicht als laufende Generierung.
Themenaktion `87` filtert eine konkrete Aufgabenliste. Klausurergebnis bleibt
gemäß `app/assessment/service.py:231–233` eine gleiche Gewichtung objektiver
Ergebnisse mit offenen Tutoranteilen, keine behauptete Hochschulnote.

### CodingPage — fortsetzen zuerst, langsame ACKs sicher behandeln

**Pain Point:** Der neue mobile Screenshot zeigt Formularfelder zur Erstellung
über fast den gesamten ersten Bildschirm; „Deine Aufgaben“ folgt danach. Bei
täglicher Übung ist Fortsetzen häufiger als Neuanlage. Die sieben Vorlagen und
Java/Python/JavaScript sind nützliche, ehrliche Grenzen; sie sind kein allgemeines
IDE- oder vollständiges Modulhandbuchangebot. Der schwerwiegende Fehler ist B1.

**Konzept:** Aktive/letzte Aufgabe prominent fortsetzen; Neuanlage als zweite
Aktion. Runnerbereitschaft bleibt deutlich. Beispiele, Hilfe und Testdetails
bleiben bei der Aufgabe. Nach erzeugter Folgeaufgabe einen direkten Link zeigen,
ohne den bestehenden Draft ungefragt zu verlassen.

**Umsetzung:** B1 vor visuellen Änderungen. `CodingPage.tsx:65–78` bei vorhandenem
Bestand umordnen, Kursfilter und vorhandene Pagination erhalten. `155` nutzt die
ID der tatsächlich erzeugten Folgeaufgabe für einen bewussten „Öffnen“-Link.
`CodeEditor`-Fokus und Ctrl/⌘Enter schützen. Testantwort/Fehlerausgabe bezeichnet
den konkreten Lauf und seine Dateien. Quellen-/Aufgabenbindung und Runnergrenzen
werden nicht durch unkontrollierte Shellbefehle ersetzt.

### AnalyticsPage — aus Zahlen eine konkrete nächste Handlung machen

**Pain Point:** Das neue Bild unterscheidet ordentlich erfasste Arbeit, gemessenen
Lernstand und fehlende Daten. Für die Prüfungsentscheidung bleiben aber nur
Zähler und ein generischer `/learning`-Link. Eine zuvor gewählte Kursauswahl
geht beim Seitenwechsel verloren (`AnalyticsPage.tsx:29`, `63`).

**Konzept:** Optionaler Wochenrückblick. Zwei nachvollziehbare Themenlücken mit
Kurs, Datenbasis und Aktion; ohne Messwert „Noch nicht überprüft“ statt Prozent
oder erfundener Schwäche. Aktivitäten wie PDF-Öffnungen bleiben Aktivitäten.

**Umsetzung:** Kursfilter in URL/Workspace speichern, an Folgeaktionen erhalten.
`60–63` mit konkreten validierten Themen-/Kurs-Links erweitern; bei fehlenden
passenden Aufgaben zurück zur Quelle oder ausdrücklich neue Übung vorbereiten.
`52–58` und die serverseitigen Schwellen/Datengrenzen behalten. Keine Lernzeit
aus offenen Fenstern ableiten, keine künstliche Notenprognose einführen.

### AiPage — Werkzeug vom Lernziel aus öffnen

**Browserbeleg / Pain Point:** Der synthetische Desktopzustand ist 2.712 px hoch,
enthält 24 Felder und mehrere Wege zur Freigabe, Paketbildung und Verbindung.
Der Job ist legitim, aber selten. Nutzer wollen normalerweise „Diese Frage
erklären“ oder „Aus diesem Abschnitt Übungen bekommen“, nicht eine allgemeine
KI-Verwaltung täglich konfigurieren.

**Konzept:** Kontextuelle Aktion aus Kurs/Reader: 1. begrenzte Quelle und Ziel
prüfen, 2. Paket/Work-Schritt ausführen, 3. Vorschläge prüfen. Auf der optionalen
Seite Verbindung und laufender Auftrag oben; Rechte-/Adapter-/Kostenverwaltung
in Details. Manuelles ZIP/Text/JSON bleibt als portabler Ersatzweg erreichbar.

**Umsetzung:** `AiPage.tsx:198–526` in Auftrag und Konfiguration gliedern.
Vorausgefüllte Kurs-/Quellen-ID muss weiterhin gegen reale Freigaben geprüft
werden; Kategorien explizit bestätigen. Fertiger Paketstatus verlinkt die
passende Vorschlagsprüfung. Scopewechsel löscht heute korrekt alten kopierbaren
Text (`57–60`); diese Regel erhalten. Audit-GET `40–42` erst bei geöffnetem
Advancedbereich `573` laden. Zugangsdaten/MCP-Konfiguration bleiben aus normalen
Lernaktionen heraus. Keine automatische Datenfreigabe als UX-Abkürzung.

## Reihenfolge und prüfbare Abnahme

1. **Text- und Inhaltsvertrauen herstellen:** B1, B2, B4; verzögerter ACK plus
   zwischenzeitlicher Edit/Navigation, gespeicherter Serverstand gegen sichtbaren
   Draft vergleichen. B3 mit gespeichertem Filter und konkretem Hash prüfen.
2. **Lernen auf eine Handlung zuspitzen:** kompakter Overview, gemeinsame
   Aufgabenbibliothek, eindeutige Vorschlagsprüfung. Der Stressbestand mit 200
   Aufgaben darf keine 27.891-/133.068-px-Seite mehr erzeugen. Ein begrenztes
   Fenster muss trotzdem jede konkret adressierte ID erreichen können.
3. **Tastatur und Mathe konsistent machen:** Einfügehilfen in den Antwortfeldern,
   sichere Formelvorschau, klarer automatischer Prüfumfang. Session-Kürzel wirken
   weiterhin nicht in Eingabefeldern und kollidieren nicht mit Text-Undo.
4. **Rückblick und KI kontextualisieren:** Kurs/Thema/Quelle bleiben über Links,
   Filter und Rückkehr erhalten; keine zusätzliche Hauptnavigation nötig.

Die Umgestaltung darf die bestehenden Sicherheitsbelege nicht verwässern:
Review-UUID und durable Undo-Intent, konkrete native Review-/Undo-Identität,
Writerfencing nach Lock/vor Commit, Exactly-once-Replay, Snapshot-/Handoff-
Journalprüfung und ehrliche `UNDO_UNAVAILABLE`-Grenze bleiben verbindlich.
Ein UI-Fehler darf nicht mit stiller Neuplanung, direktem Scheduler-SQL oder
pauschalem Löschen der Offlinequeue „repariert“ werden. Ebenso bleiben explizite
Vorschlagsfreigaben, Source-Versionen und begrenzte Quellenfreigaben bestehen.

## Quellen des Reviews

- Produktquellen mit den im Text genannten Zeilen, geprüft am angegebenen HEAD.
- `docs/qa/page-purpose-audit-20261009/state-map.md`.
- `docs/qa/page-purpose-audit-20261009/browser-walk.json`, synthetischer Lauf bei
  1440 und 390 px; relevante Bilder `learning`, `study`, `studyCards`, `assessment`,
  `coding`, `analytics`, `explanations`, `ai` im dortigen Screenshotverzeichnis.
- `docs/qa/page-purpose-audit-20261009/behavior-probes.json`, Record
  `coding-newer-edit-during-save`: bestätigter B1-Entwurfsverlust mit verzögertem
  Erfolgs-ACK, neuer lokaler Recovery und anschließendem Neuladen.
- Dasselbe Artefakt, `study-card-newer-edit-during-save`: bestätigter B4-Verlust
  des während eines verzögerten ACKs bearbeiteten Kartenentwurfs, mit transparentem
  Hinweis zur korrigierten Stringvergleich-Auswertung; `normal-study-session`
  und `screenshots/study-session-valid-{1440,390}.png`: erfolgreicher Sessioneinstieg.
- Dasselbe Artefakt, `proposal-bulk-approval-ignores-visible-draft`: bestätigtes
  B2 mit sichtbarer Korrektur B, ID-only-Sammelfreigabe, HTTP 200 und freigegebenem
  Original A; `screenshots/probe-proposal-bulk-approval.png` zeigt den Folgezustand.
- Erfolgreiche ältere Sessiongestaltung:
  `docs/qa/study-deck-scope-20261007/session-light-1440.png`.
- `docs/qa/workspace-update-20261009/quality-summary.json`: bestehende
  Releasevalidierung ist ein Funktionsbeleg, keine Messung realer Lernzeit oder
  Garantie vollständiger Abdeckung der hier beschriebenen ACK-Stresspfade.

Die gemeinsame dynamische Prüfung wird vom Hauptagenten protokolliert; B1, B2 und
B4 sind wie oben beschrieben bestätigt. Für B2a und B3 werden keine
zusätzlichen Browserläufe oder Ergebnisse behauptet. Der normale Sessioneinstieg
ist eine begrenzte positive Probe, keine erneute Gesamttestfreigabe.
