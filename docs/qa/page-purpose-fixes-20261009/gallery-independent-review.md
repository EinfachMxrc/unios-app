<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Unabhängige Bildprüfung der sechs Hauptansichten

09.10.2026. Die erste bereitgestellte Galerie wurde vollständig als Bild
geöffnet: Heute, Kurse, Lernen, Notizen, Termine und Einstellungen, jeweils
Hell/Dunkel und 1440/390px, insgesamt 24 PNG-Dateien. Keine eigenen Dienste
oder Browserläufe; nur synthetische Aufnahmen aus Roots Integration.

| Ansicht | Desktop Hell/Dunkel | Mobil Hell/Dunkel |
| --- | --- | --- |
| Heute | Klare nächste Aktion, lesbare Aktivitätszeilen, fünf ruhige Hauptwege | Hauptaktionen umbrechen geordnet; unten schmale Wortspalte in leerer Stundenplanmeldung gefunden |
| Kurse | Karten und Suche klar getrennt, bekannte Semesterwahl sichtbar | Karten volle Breite, Suche und Aktion innerhalb der Seite |
| Lernen | Nächster Lernauftrag und begrenzte Übungsvorschau deutlich, Nebenplanung darunter | Fokusblockstatus und Startaktion rechts im Card-Container abgeschnitten |
| Notizen | Seitenauswahl und Dokument klar getrennt, Eigenschaften geschlossen | Dokument zuerst, Notizwechsel erreichbar, langer Titel geordnet zweizeilig |
| Termine | Nächste Frist und Kalender/Abgaben getrennt, Kalendersteuerung geordnet | Export, Frist und Kalendersteuerung umbrechen innerhalb 390px; Agenda statt schmaler Wochenmatrix |
| Einstellungen | Bereichsauswahl und aktive Darstellung klar getrennt | Native Bereichsauswahl und Formzeilen ohne sichtbare Kollision |

Abgesehen von den beiden genannten Fällen waren in diesen Aufnahmen keine
abgeschnittenen Hauptaktionen, überlappenden Texte oder horizontal hinauslaufenden
Dokumente sichtbar. Die hellen und dunklen Varianten erhalten dieselbe Hierarchie.
Das ist eine qualitative Bildprüfung, kein gemessener WCAG-Kontrastnachweis.
Der im Fullpage-PNG am ursprünglichen Viewportende eingefangene feste mobile
Navigationsstreifen ist kein Beleg einer dauerhaften Inhaltsüberdeckung.

## Zwei konkrete Befunde und gezielte Korrekturen

**Fokusblock auf Mobil:** `StudyBlocksPanel.tsx` legte Titel, Metadaten, Uhrzeit
und Aktionsgruppe als gleichrangige Kinder einer allgemeinen Flexzeile an.
Die Card verbirgt Überlauf; dadurch kann `document.scrollWidth` korrekt sein,
während die Aktion trotzdem abgeschnitten ist. Die Zeile erhält nun eigene
Layoutklassen: Desktop mit Zeitspalte, Mobil mit eigener Zeitzeile und voller
Aktionsbreite, `min-width: 0` und Textumbruch. `study-blocks.spec.ts` prüft bei
390px in beiden Themes den inneren Scrollumfang, alle Kinder und den Link
gegen die tatsächliche Card-Fläche; der Link öffnet anschließend den richtigen
Fokuskontext.

**Leere Stundenplanmeldung auf Mobil:** Die Flexzeile ließ den Text neben dem
langen Link auf wenige Zeichen schrumpfen. Im vorhandenen 520px-Block verwendet
sie jetzt ein Icon/Text-Grid und eine eigene Linkzeile. `today-empty.spec.ts`
prüft mindestens 240px Textbreite, den Link unter dem Text und dessen Begrenzung
durch die Karte. Die bestehende kompakte Höhen- und Abstandskontrolle bleibt.

Die Korrekturen verändern Layout und additive CSS-Klassen. Fachlogik,
Kalendermutationen und gespeicherte Daten bleiben unverändert. Betroffenes
ESLint und Typecheck bestanden. Die erste Bildprüfung dokumentiert die Ursache;
die nachfolgende finale Prüfung bewertet die korrigierte Darstellung separat.

## Finale Prüfung des eingefrorenen Builds

Die von Root nach dem letzten Produktfreeze aus `.tmp/page-purpose-fixes/pwa-release`
bereitgestellte Galerie wurde erneut vollständig geöffnet: alle 24 Original-PNGs
der sechs Hauptansichten, jeweils Hell/Dunkel und 1440/390px. Die Dateien wurden
am 09.10.2026 zwischen 21:21:23 und 21:21:42 lokaler Zeit erzeugt.
`gallery-summary.json` enthält 24 Aufnahmen, durchgehend `overflow: false`
und `errors: []`. Das ist Roots Laufbeleg; diese unabhängige Prüfung betrachtet
die tatsächlich erzeugten Bilder, ohne einen eigenen Browser zu starten.

| Ansicht | Finale Bildprüfung Hell/Dunkel, Desktop/Mobil |
| --- | --- |
| Heute | Hero-Aktionen umbrechen geordnet. Die leere Stundenplanmeldung hat auf Mobil eine breite Textzeile und den vollständigen Link darunter; keine schmale Wortspalte mehr. |
| Kurse | Karten, Semesteraktion und Moodle-Suche bleiben innerhalb der Inhaltsfläche. Mobil sind beide Kurse vollständig beschriftet und einzeln erreichbar dargestellt. |
| Lernen | Fokusblock zeigt auf Mobil Titel, Metadaten, Datum und Status geordnet untereinander. „Jetzt lernen“ steht vollständig innerhalb der Karte; kein abgeschnittener Aktionsrand mehr. Desktop behält eine eigene Zeitspalte. |
| Notizen | Desktop trennt Seitenauswahl und Dokument; Mobil steht das Dokument im Vordergrund. Langer Titel bricht lesbar um, Kurszuordnung und Bearbeiten-Aktion kollidieren nicht. |
| Termine | Nächste Frist, Kalender/Abgaben und Kalendersteuerung bleiben getrennt. Mobil umbrechen Export, Fristkarte und Aktionen; die Tagesdarstellung vermeidet eine schmale Wochenmatrix. Die Terminliste enthält auch den längeren Titel mit geordnetem Umbruch. |
| Einstellungen | Desktop-Bereichsauswahl und mobile native Bereichsauswahl sind klar. Formlabels, Selects und Schalter bleiben in beiden Themes innerhalb ihrer Karten. |

Beide zuvor gefundenen Mobilefehler sind in den neuen hellen und dunklen Bildern
behoben. Keine zusätzliche sichtbare Kollision oder abgeschnittene Hauptaktion
in diesen 24 Zuständen gefunden. Die mobile feste Navigation ist im Fullpage-PNG
am ursprünglichen Viewportende eingefangen; aus diesem Aufnahmeeffekt wird kein
dauerhaftes Verdecken des darunter weiter scrollbaren Inhalts abgeleitet.
Interaktion, Fokus, Resize und gemessene Barrierefreiheit benötigen die separaten
Browser- und Lighthousebelege; diese Bildprüfung ersetzt sie nicht.

Die vier gezielt geprüften korrigierten Mobilebilder sind byteweise gebunden:

| Datei | SHA256 |
| --- | --- |
| `gallery/learning-light-390.png` | `761678f693249f0b35c0608df69c5d9a9634f1b7b1dc3b152641a5933dc9ce6e` |
| `gallery/learning-dark-390.png` | `0d800c615b6629cf7bf6947ed9b47e75dba14d655fc70f7c9ab69ccd6e86f9bf` |
| `gallery/today-light-390.png` | `7e742187088df980c51947bd19e1539a49705ee4c0a7f58a581d1523745bab79` |
| `gallery/today-dark-390.png` | `ad1a5d9391de27797c91514b23315a42c9f48f60c6325af96cf4c03d70123126` |

SHA256 von `gallery-summary.json`:
`f1fc9fdbd28c140d3a32bfcb277d2badb4a4e0d5abd1af47fc4c70508d03f018`.
