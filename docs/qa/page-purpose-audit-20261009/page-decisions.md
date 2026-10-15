<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Entscheidung für jede vorhandene Route

Stand: UniOS 0.1.22, Quellrevision
`05e56cfad86b110e2d1be505adad2b58e3ab6d2a`. Die Tabelle umfasst alle **49 Routen**
aus [route-inventory.json](route-inventory.json), einschließlich Detailrouten,
Einrichtung und Fehlerseite. Sie ist eine Produktentscheidung auf Grundlage der
drei Reviews, keine Ankündigung bereits umgesetzter Änderungen.

Der Standardarbeitsraum hat **fünf Hauptbereiche: Heute, Kurse, Lernen, Notizen
und Termine**. Die weiteren Flächen sind Unterseiten, Direktziele, Funktionen
unter „Neu“ beziehungsweise „Mehr“ oder bewusst aktivierbare Angebote. KI,
Projekte, Noten und Uni-Mail sind derzeit standardmäßig ausgeschaltet.
Die Bilder mit allen aktivierten Modulen zeigen einen Prüfzustand und keine
überladene Standardnavigation.

**Behalten** heißt: ein klarer eigener Arbeitsauftrag, auch als Unterseite.
**Zusammenführen** heißt: gemeinsame Navigation oder wiederverwendbare
Oberfläche für denselben Arbeitsschritt. **Kontextuell** heißt: Einstieg beim
betroffenen Objekt oder Vorgang statt eines weiteren Hauptmenüpunkts.
**Optional** heißt: gezielt aktivierbar oder anpinnbar; keine Voraussetzung für
normales Lernen.

Keine dieser Entscheidungen entfernt bestehende Aufgaben, Daten, Backenddienste
oder Fachverträge. Eigene Todos, offizielle Abgaben, akzeptierte Lernblöcke,
Kartenbewertungen, Notizrevisionen, Quellenbelege und Importhistorien bleiben
erhalten und erreichbar. Zusammenführungen ändern zunächst den Zugang, nicht
die fachliche Bedeutung. Vorhandene Direktlinks müssen das konkrete Objekt
weiter öffnen; eine optionale Fläche erklärt beim Aufruf ihren Aktivierungsweg.
Freigaben, Writer-Grenzen, Revisionen und Rücknahmen bleiben wirksam.

Review-Bezug: [K = Kernarbeit](core-review.md),
[L = Lernen](learning-review.md),
[O = Organisation, Eingang und Betrieb](organization-review.md).
Die Detailbelege, Pain-Points, Implementierungsschritte und Beleggrenzen stehen
in diesen Dokumenten. „Künftiger Ort“ benennt die gewünschte Oberfläche; daraus
folgt keine neue URL und keine unbestätigte Datenmigration.

| Nr. | Seite / vorhandene Route | Zweck | Urteil | Künftiger Ort und erhaltener Zugang | Review-Bezug |
| --- | --- | --- | --- | --- | --- |
| 1 | Heute · `/` | Nächsten sinnvollen Schritt wählen und Arbeit fortsetzen | behalten | Hauptbereich Heute; Fortsetzen und Empfehlung mit jeweils passendem Ziel | K §1 |
| 2 | Kurse · `/courses` | Das richtige Fach auswählen | behalten | Hauptbereich Kurse; einfache Übersicht mit erhaltenen Filtern | K §2 |
| 3 | Kursdetail · `/courses/:id` | Quellen, Aufgaben und eigene Notizen eines Fachs verwalten | behalten | Kurse → Fach; Arbeitsaktionen öffnen den zugehörigen Fokusarbeitsplatz | K §3 |
| 4 | Materialviewer · `/material/:id` | Eine bestimmte Quellenversion lesen, markieren und zitieren | zusammenführen | Derselbe Quellenarbeitsplatz wie im Fokus; direkter Versions-/Seitenlink bleibt nutzbar | K §4 |
| 5 | Lernstart · `/learning` | Weiterlernen, offene Fragen und nächste passende Arbeit wählen | behalten | Hauptbereich Lernen; kompakter Einstieg mit Links zu Üben, Karten und Plan | L LearningPage |
| 6 | Fokusarbeitsplatz · `/learning/focus/:kind/:id` | Quelle, fortlaufende Mitschrift und Lernen im Kurs-, Block- oder Zykluskontext verbinden | behalten | Normaler Arbeitsort unter Lernen/Kurs; Quelle, Seite, Notiz und akzeptierter Block bleiben gebunden | K §5; L Lernstart |
| 7 | Notizen · `/notes` | Dauerhafte eigene Dokumente finden und bearbeiten | behalten | Hauptbereich Notizen; ausgewähltes Dokument zuerst, gleiche Dokumente wie im Quellenarbeitsplatz | K §6 |
| 8 | Termine und Abgaben · `/deadlines` | Zeit planen und tatsächliche Fristen erkennen | behalten | Hauptbereich Termine; „Als Nächstes“, Kalender und Abgaben mit unterscheidbaren Quellen | O Termine |
| 9 | Eingang · `/inbox` | Erfasste Texte, Links und Dateien prüfen und einordnen | zusammenführen | Gemeinsamer Erfassungseingang aus „Neu“ und Notizen; bestehender Direktlink und offene Items bleiben erreichbar | O Eingang; K §7 |
| 10 | Suche · `/search` | Einen Inhalt über alle Ablagen hinweg finden | behalten | Globale Schnellpalette plus Vollansicht derselben Suche; Objekt-, Version- und Seitenziele erhalten | K §8 |
| 11 | Schnellnotizen · `/jots` | Gedanken ohne vorherige Ablageentscheidung sichern und verarbeiten | kontextuell | „Neu → Gedanke“ und Eingang innerhalb Notizen; Offline-Queue und ursprüngliche Jots erhalten | K §7; O Eingang |
| 12 | Benachrichtigungen · `/notifications` | Relevante Hinweise erkennen und ausführen | kontextuell | Glocke/Badge und konkrete Objektaktionen; eigene erreichbare Hinweiszentrale | O Benachrichtigungen |
| 13 | Sammlungen · `/collections` | Wiederkehrende Filter auf vorhandene Objekte speichern | optional | Gespeicherte Ansichten in Suche, Kurs und Lernen; vorhandener Experteneditor bleibt erreichbar | K §9 |
| 14 | Sprachnotizen · `/voice` | Einen Gedanken aufnehmen und später mit Transkript verarbeiten | kontextuell | „Neu → Sprache“, Bibliothek im Eingang; für häufige Nutzung anpinnbar | O Sprachnotizen |
| 15 | Eigene Dateien · `/drop` | Einen beobachteten Desktopordner als Importquelle nutzen | zusammenführen | Eingangsquelle „Beobachteter Ordner“; Einrichtung unter Verbindungen, Zuordnung pro Datei erhalten | O Eigene Dateien |
| 16 | Hochschulunterlagen · `/university-documents` | Modulhandbuch und allgemeine Hochschuldokumente lesen | kontextuell | Institutionelle Sammlung bei Kurse/Bibliothek mit Suche und direktem Quellenlink | O Hochschulunterlagen |
| 17 | Karteikarten · `/study` | Stapel wählen, fällige Karten lernen und Inhalte korrigieren | behalten | Lernen → Karteikarten; Lernen und Verwaltung innerhalb des Bereichs klar unterscheiden | L StudyPage |
| 18 | Kartensession · `/study/session/:deck` | Eine konkrete Kartenrunde fokussiert beantworten | behalten | Fokussierte Session aus Karteikarten oder Kurs; Tastaturfluss und exakt gebundenes Bewertungs-Undo erhalten | L StudySessionPage |
| 19 | Eigene Karten · `/study/cards` | Bewusst erstellte Karten und ihren Transfer verfolgen | kontextuell | Karteikarten → Eigene Karten; konkrete Kartenlinks und Transferstatus erhalten | L CardQueuePage |
| 20 | Üben und Probeklausur · `/assessment` | Aufgaben beantworten und echte Prüfer beziehungsweise Prüfungsmodus nutzen | behalten | Lernen → Üben als gemeinsamer Übungsort; fachliche Prüfer und Abgaben bleiben unterscheidbar | L AssessmentPage |
| 21 | Programmieren · `/coding` | Kursbezogene Programmieraufgaben mit echten Tests bearbeiten | behalten | Lernen → Programmieren für passende Fächer; aktiven Arbeitsbereich fortsetzen, für andere Nutzer ausblendbar | L CodingPage |
| 22 | Lernrückblick · `/analytics` | Erfasste Arbeit und gemessene Lernlücken beurteilen | optional | Lernen → Rückblick mit konkreter nächster Handlung; unbekannte Messwerte ehrlich kennzeichnen | L AnalyticsPage |
| 23 | Studientage · `/journal` | Tagesreflexion und offene Fragen sammeln | kontextuell | Lernen → Rückblick → Tag sowie Einstieg aus Heute; kein zweiter Kalenderhauptbereich | O Studientage |
| 24 | Bestimmter Studientag · `/journal/:day` | Einen eindeutig datierten Lern- und Reflexionskontext bearbeiten | kontextuell | Tagesansicht im Rückblick; Datum, Kursentwurf und Revision dürfen beim Wechsel nicht verwechselt werden | O Studientage, O3/O4 |
| 25 | Wochenüberblick · `/digest` | Eine Woche planen und auf Fristen, Karten und Material reagieren | zusammenführen | Lernen → Rückblick → Woche; Benachrichtigungslink bleibt, Fristen/Karten direkt ausführbar | O Wochenüberblick |
| 26 | Projekte · `/projects` | Optionale größere Arbeitspakete überblicken | optional | Anpinnbarer Bereich unter Mehr; aktive nächste Aufgabe und eigene Deadline sichtbar | O Projekte – Liste |
| 27 | Projektdetail · `/projects/:id` | Eigene Todos, Zusammenarbeit und referenzierte Abgaben eines Projekts bearbeiten | kontextuell | Konkretes Projekt aus Liste, Kurs oder Aufgabe; persönliche Todos und offizielle Abgaben bleiben getrennt | O Projekt – Detail |
| 28 | Noten und ECTS · `/grades` | Studienfortschritt und hypothetische Notenszenarien beurteilen | optional | Mehr → Studienfortschritt; Überblick, Module und Prognose, offizielle Quelle unverändert | O Noten |
| 29 | Uni-Mail-Hinweise · `/mail` | Hinweise und vorgeschlagene Fristen bewusst prüfen | optional | Eingang → Hinweise aus Uni-Mail; Verbindung unter Einstellungen, erzeugte Frist direkt öffnen | O Uni-Mail |
| 30 | Mensa · `/mensa` | Essensangebot und persönliche Ernährungsfilter ansehen | optional | Mehr → Campus → Mensa; bewusst aktivierte kompakte Heute-Karte möglich | O Mensa |
| 31 | Räume · `/rooms` | Raumangebote prüfen und den offiziellen Buchungsweg öffnen | optional | Mehr → Campus → Räume; angebotene Räume, unbekannte Verfügbarkeit und Buchung unterscheiden | O Räume |
| 32 | myCampus · `/campus` | Institutionelle Informationen und Dokumentquellen finden | optional | Mehr → Campus; aktiven Informationsbereich und Materialziele in Direktlinks erhalten | O myCampus |
| 33 | Regeln · `/rules` | Wiederkehrende Abläufe bewusst konfigurieren, prüfen und ausführen | optional | Einstellungen → Automatisierung; Entwurf, Vorschau und gespeicherte Ausführung klar getrennt | O Regeln |
| 34 | KI-Kartenvorschläge · `/anki` | Vorgeschlagene Karten redaktionell prüfen und freigeben | kontextuell | Gemeinsame Vorschlagsprüfung, Typ „Karten“, aus Kurs oder Karteikarten; Freigabe und Quellbeleg erhalten | L CardQueuePage |
| 35 | Übungsvorschläge · `/exercises` | Vorgeschlagene Übungen prüfen und bewusst übernehmen | zusammenführen | Gemeinsame Vorschlagsprüfung, Typ „Übungen“; danach Lernen → Üben, fachlichen Freigabestatus erhalten | L ExercisePage |
| 36 | Erklärungsvorschläge · `/explanations` | Antworten zu konkreten offenen Fragen prüfen | kontextuell | An der Frage und in derselben Vorschlagsprüfung; Frage-ID, Quelle und Entscheidung erhalten | L ExplanationPage |
| 37 | KI-Pakete und Freigaben · `/ai` | KI-Verbindungen und bewusste Inhaltsfreigaben verwalten | optional | Einstellungen/Werkzeuge → KI; benötigte Aktionen aus dem konkreten Kurs öffnen | L AiPage |
| 38 | Erweiterungskatalog · `/addons` | Optionale Erweiterungen auswählen und kontrolliert aktivieren | zusammenführen | Einstellungen → Erweiterungen, Typ „Funktionen“; Installieren, Zustimmen und Aktivieren bleiben echte Grenzen | O Erweiterungen – Katalog |
| 39 | Erweiterungsfläche · `/addons/:id` | Die konkrete aktivierte Erweiterung verwenden | kontextuell | Über ihre Aufgabe beziehungsweise persönliche Pins; Ausgabe und laufender Zustand bleiben an die Erweiterung gebunden | O Erweiterung – Detail |
| 40 | Connector-Katalog · `/marketplace` | Verbindungsprofile installieren und deren Rechte freigeben | zusammenführen | Derselbe Erweiterungsbereich, Typ „Verbindungen“; Dienstbedarf zuerst, Paketdetails und Rechte weiterhin erreichbar | O Marketplace |
| 41 | Hintergrundaufträge · `/jobs` | Fortschritt, Fehler, Wiederholung und Abbruch langer Vorgänge sehen | kontextuell | Status am auslösenden Material/Kurs; zentrale Auftragsliste unter Werkzeuge als Fehlerziel erhalten | O Hintergrundaufträge |
| 42 | System und Verbindungen · `/system` | Betriebszustand, Wiederherstellung und konkrete Verbindungsfehler klären | kontextuell | Einstellungen → System/Verbindungen sowie adressierbares Ziel aus einer Störung; Details und Sicherung erhalten | O System, O6 |
| 43 | Aktivität · `/activity` | Veränderungen und Fehler nachvollziehen | kontextuell | Benachrichtigungen/Einstellungen → Verlauf; konkrete Quellen- und Sync-Ziele aus jeder Zeile | O Aktivität |
| 44 | Einstellungen · `/settings` | Persönliche Präferenzen, Daten und Verbindungen verwalten | behalten | Sekundärer Einstellungen-Einstieg mit Abschnitten und dauerhaften Abschnittslinks | O Einstellungen |
| 45 | Mehr · `/more` | Sekundäre Funktionen finden, ohne Hauptnavigation zu überladen | behalten | Sekundärer Aufgabenindex: Erfassen, Bibliothek, Rückblick, Campus, Verbindungen; Module und Pins respektieren | O Mehr |
| 46 | Willkommen · `/welcome` | Einführung und isolierte Demo anbieten | kontextuell | Erster Einstieg beziehungsweise Hilfe; Ausprobieren, Unterlagen mitnehmen und Hochschule verbinden unterscheiden | O Onboarding |
| 47 | Import · `/import` | Migration und Serienimport mit geprüftem Ziel durchführen | kontextuell | „Neu → Import“, Eingang und Einführung; Teilresultate, Wiederholung und konkreter Ergebnislink erhalten | O Import |
| 48 | Einrichtung · `/setup` | Hochschule/Verbindungen erstmals einrichten oder reparieren | kontextuell | Fortsetzbare Checkliste aus Willkommen/Einstellungen; optionalen Quellenbedarf verständlich erklären | O Setup |
| 49 | Nicht gefunden · `*` | Nach einem fehlenden oder veralteten Ziel weiterarbeiten | kontextuell | Fehlerziel mit Erklärung, sinnvoller Rückkehr, Suche und Heute; keine stille Weiterleitung | O Nicht gefunden |

Für den Umbau gilt: zuerst Textsicherheit, Kontextbindung und konkrete Fehler
beheben; anschließend fortlaufende Quellenmitschrift und Dokumentfokus; danach
die sekundären Zugänge zusammenlegen. Lernaufgaben werden nicht aus der
Lernstartseite entfernt, bevor sie am gemeinsamen Übungsort mit Kurs, Auswahl,
Status und bisherigen Ergebnissen erreichbar sind. Ebenso bleibt die bestehende
Vorschlagsprüfung verfügbar, bis die gemeinsame Prüfung alle drei Typen samt
Freigaben vollständig unterstützt.
