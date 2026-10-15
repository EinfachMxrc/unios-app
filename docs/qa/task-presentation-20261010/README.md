<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Aufgaben vollständig und einheitlich lesen

Prüfung vom 10.10.2026. Alle Bilder und Browserfälle verwenden ausschließlich
erfundene Aufgaben. Die Prüfung umfasst die Darstellungswege und alle acht
Assessment-Antworttypen; sie ist keine fachliche Bewertung sämtlicher
persönlich gespeicherter Aufgaben. Der freigegebene UniOS-Quellenkatalog wurde
ergänzend geprüft. Lokale persönliche Daten wurden nicht gelesen oder kopiert.

## Reibungspunkte und Änderungen

| Nutzerproblem | Bedienkonzept | Umsetzung |
| --- | --- | --- |
| Formeln, Listen, Tabellen und Code sehen je nach Aufgabenansicht unterschiedlich aus. | Ein gemeinsames lesbares Aufgabendokument für Frage, Beschreibung, Hinweis und Rückmeldung. | `AssessmentQuestion` rendert eine passive Markdown-Teilmenge; `AssessmentInline` formatiert Auswahltexte, `AssessmentCode` ausdrücklich angeforderten Lösungscode. |
| Wahrheitstabellen drücken ihre Überschriften buchstabenweise zusammen. | Spalten behalten eine lesbare Breite; breite Tabellen bewegen sich intern per Trackpad oder Tastatur. | Semantische Tabellen mit Spaltenüberschriften, eigenem fokussierbarem Scrollbereich und natürlicher Inhaltsbreite. |
| Lange Antworten und Codebausteine verdrängen Bedienelemente. | Prosa bricht um, Code behält seine Einrückung, Verschiebepfeile bleiben erreichbar. | Begrenzte Mindestbreiten, eigene Code-Scrollbereiche, getrennte Reihenfolge-Steuerung und größere Touchziele. |
| Aufgabenvorschläge verteilen ihre Formulare auf schmalen Fenstern nebeneinander. | Felder bleiben untereinander; eine aufklappbare Vorschau zeigt die Frage vor der Freigabe. | Eigene Blockregel statt einer durch die CSS-Schicht übersteuerten Hilfsklasse. Quelle und gesendeter Text bleiben unverändert. |
| Zahlenantworten bekommen ein großes Erklärfeld ohne Format-Hilfe. | Ein kompaktes Textfeld mit Beispielen für Dezimalpunkt und Bruch. | Kein neuer Prüfer und keine stille Umwandlung der Antwort; zugängliche Hilfe über `aria-describedby`. |
| Rechenweghilfe wird Teil der langen Feldbeschriftung. | Kurze Feldbezeichnung und separat zugeordnete Erklärung. | Hilfetext außerhalb des Labels, über `aria-describedby` verbunden. |
| Alte Tutor-Rückmeldungen werden während einer Probeprüfung angezeigt. | Laufende Prüfungen zeigen keine vorherige Hilfestellung oder Bewertung. | Reviews wie Hilfe und Ergebnis an `!examRunning` gebunden; mit tatsächlich vorhandenem alten Review getestet. |

Formeln unterstützen `$…$`, `\(…\)`, `$$…$$` sowie `\[…\]`, darunter
Brüche, Matrizen und Summen. Ungültiges oder nicht unterstütztes LaTeX bleibt
lesbar. Der mathematische Ausgangsausdruck des Prüfers bleibt ausdrücklich in
seiner bestehenden Schreibweise, beispielsweise `2*x^2-8*x+6`.

HTML, Bilder, externe Links und interaktive Lernblöcke werden im Aufgabentext
nicht aktiviert. Java-Darstellung verändert höchstens Layout-Leerraum; mehrzeiliger
Code behält seinen Inhalt. Ausdrückliche Lösungscodeblöcke bleiben auch dann Code,
wenn sie selbst Markdown-Zäune enthalten. Musterlösungen erscheinen weiterhin
erst nach dem vorgesehenen Öffnen beziehungsweise Bestätigen.

## Abnahme

Die Browserfälle decken Freitext, Auswahl, mathematische Umformung, Parsons-Code,
Reihenfolge, mündliches Transkript, Zuordnung und Zahlenantwort ab. Zusätzlich
wurden Übungsfragen mit Musterlösung, Vorschlagsprüfung, Coding-Arbeitsplatz,
Kursaufgaben, Fristtexte und Schnellansicht geprüft. Auswahlwerte, Indizes,
Zuordnungen, Rechenwege und Vorschlagsquellen werden unverändert übertragen.

Hell/Dunkel bei 1280×720 und 390×844, 100/150 % Schrift, lange ungetrennte Titel,
breiter Code und Tabellen, Tastaturbedienung sowie verborgene Lösungen wurden
berücksichtigt. Neue Schriftgrößen verwenden `rem`, damit die Schriftvergrößerung
auch die Aufgaben selbst erreicht.

Alle 1.031 Frontendtests, darunter 85 gezielte Darstellungs-/Integrationsfälle,
Typecheck, vollständiges ESLint, 67 de/en-Namespaces und der PWA-Build bestanden.
41 Browserfälle bestanden gemeinsam; nach der letzten kleinen mobilen
Überschriftenkorrektur bestanden die drei betroffenen Browserfälle erneut.
Die abschließenden Prüfergebnisse, Dateihashes und Bilder sind in
`verification-final.json` verzeichnet (Quelltext-Hashes mit LF-Zeilenenden).
Vollseitenbilder zeigen synthetische Grenzfälle; ihre fixierten Navigationsleisten
können als Browseraufnahme an einer anderen vertikalen Position erscheinen als
in einer normalen Fensteransicht. Sie belegen keine neue Installation.

Keine Abhängigkeit, Backend-/Schemaänderung, Windows-Neuinstallation oder
Serververöffentlichung gehört zu diesem Darstellungs-Arbeitspaket.
