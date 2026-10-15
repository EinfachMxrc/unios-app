<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Product Quality Pass · 04.10.2026

Dieser Pass verbessert bestehende Abläufe. Der einfache Einstieg mit Heute,
Kurse, Lernen, Notizen und Termine bleibt erhalten. Technische Werkzeuge liegen unter
Mehr. Der Stand gehört zur Entwicklung nach Alpha1; die unveränderten
0.1.19-Installer enthalten ihn noch nicht.

## Arbeitskontext und schnelle Interaktion

Explizite UI-Zustände bleiben pro Bereich erhalten: Kursansicht/Materialfilter,
Suchformular und URL-Filter, Kalenderwoche, PDF-Version/Seite/Zoom/Farben/Suche/
Kommentarseitenleiste, Notizeditormodus/Gliederung und Programmierdatei.
Zurück stellt Scrollposition und Tastaturfokus wieder her. Auch initiale
Browser-Einträge sind nach URL getrennt; verschiedene Seiten dürfen den
History-Schlüssel `default` nicht miteinander teilen.

Der Sitzungsspeicher ist auf 160 Einträge und 768 KiB UTF-8 begrenzt.
Er speichert ausschließlich ausdrücklich angebundene UI-Felder. Passwörter,
Kalenderlinks und komplette Formulare werden nicht automatisch erfasst.
Nicht abgeschickte Übungsantworten, Prüfungskontexte, Cursor und Textauswahlen
bleiben nur im RAM. Bestehende Notiz-/Codeentwürfe benutzen weiterhin ihren
bisherigen getrennten Entwurfsspeicher. Eine erfolgreiche Gerätekopplung leert
den UI-Arbeitskontext. Cursorbewegungen schreiben keine Sitzungsspeicherdatei.

Eine Kartenbewertung wird zuerst dauerhaft in IndexedDB abgelegt. Danach erscheint
die nächste Karte. HTTP-Uploads laufen außerhalb der lokalen Schreibwarteschlange;
parallele Uploadaufrufe werden zusammengeführt. Eine Bestätigung entfernt nur ihre
Review-UUID, damit inzwischen hinzugefügte Bewertungen erhalten bleiben. Offline-
und Lease-Prüfungen bleiben wirksam. Ein lokaler Speicherausfall zeigt einen Fehler
und überspringt keine Karte. Es gibt keine optimistische Bestätigung von Abgaben,
Buchungen oder Prüfungsantworten.

## Abgleich der 25 Punkte

| Nr. | Qualitätsziel | Umsetzung bzw. vorhandener geprüfter Weg |
|---|---|---|
| 1 | Kontext erhalten | Sitzungsspeicher, URL-Filter, Scroll/Fokus, Cursor; Seite 47 mit Zoom und genauem Offset geprüft. |
| 2 | Ladezustände und Vorladen | Gemeinsame Seiten-/Zeilen-/Editor-Skeletons, PDF-Platzhalter behalten ihre Seitengröße; Route-Prefetch und höchstens zwei Kurs-Metadatenabfragen, keine PDF-Dateien oder Mutationen. |
| 3 | Speicherzustand verstehen | Gemeinsamer `SaveIndicator`, tatsächliche lokale/Server-/Konfliktmeldungen; keine erfundene Serverbestätigung. |
| 4 | Aus Fehlern herauskommen | Ladefehler bieten Daten erneut laden und Verbindung prüfen. Schreibaktionen werden dadurch nicht erneut ausgeführt. |
| 5 | Leere Zustände mit Einstieg | Notizliste bietet Erstellen; erfolglose Suche bietet Filter zurücksetzen. Bestehende Lern-/Raumhinweise bleiben konkret. |
| 6 | Funktionen gestuft zeigen | Fünf Hauptbereiche; technische Bereiche unter Mehr, Suche/Entdecken bleibt verfügbar. |
| 7 | Einheitliche Felder | `FormField` für Titel, Suche/Filter, Kalender und Serverkopplung; sichtbare Labels, Pflichtfeld, Helper, Inline-Fehler. |
| 8 | Palette für Aktionen | Vorhandene Palette verbindet Navigation, Suchtreffer, neue Notiz, Lernzugänge und registrierte Aktionen. Tastaturablauf geprüft. |
| 9 | Suchvorschau | Markierte Quellenausschnitte direkt im Ergebnis, genaue PDF-Seitenlinks und Notiz-Peek; kein vollständiges Laden aller Dateien. |
| 10 | Rückgängig | Vorhandene lokale Aktionshistorie für Notizfassungen, Eingang und Beziehungen; Wiederherstellung über revisionsgeprüfte Aktionen, kein Undo von Hochschulabgaben. Notiz-Undo im Browser geprüft. |
| 11 | Sofort reagieren | Karten nach dauerhaftem lokalem Commit weiterschalten; Entwürfe bleiben erhalten. Bei Speicherfehler bleibt die Karte sichtbar, der HTTP-Abgleich blockiert keine weitere Bewertung. |
| 12 | Mobile Sheets | Notizquellenvorschau als Portal am Bildschirmrand, Desktop bleibt verankerte Vorschau; Schließen und Öffnen mit Touch geprüft. |
| 13 | Touch-Flächen | Wichtige gemeinsame Buttons, native Felder/Selects und Vorschauaktionen bei grobem Zeiger mindestens 44 px. |
| 14 | Fokusmodus | PDF, Programmieren und Üben mit sichtbarem Ausstieg; Notizmodus bleibt erhalten; Karten nutzen die bestehende Sitzung. |
| 15 | Seitenaufbau | Gemeinsame Shell/Überschrift/Aktionen, kein störender programmgesteuerter Überschriftsrahmen; Galerie der Hauptabläufe. |
| 16 | Typografie | Bestehende Schrift-/Größenhierarchie bleibt maßgeblich; Feld-/Status-/Vorschautexte verwenden gemeinsame Stile. |
| 17 | Abstände | Komfortabel bleibt Standard; optional Kompakt für Listen/Karten-Innenabstand, Touch-Minima bleiben erhalten. |
| 18 | Bedeutung von Farben | Laufender Status neutral statt Fehlerrot; Save-/Fehler-/Leerzustände mit Icon und Text, Farbe allein genügt nicht. |
| 19 | Aktualität | Letzter erfolgreicher Stundenplanabruf direkt sichtbar; vorhandene Cache-Zeit bleibt im Offline-Hinweis. |
| 20 | Offline verstehen | Aufklappbarer Hinweis nennt geladene Inhalte, Entwürfe und Karten; neue Daten, Abgaben und Buchungen benötigen Verbindung. Bestehende Job-/Konflikt-/Entwurfsabläufe bleiben erhalten. |
| 21 | Weniger Meldungsrauschen | Vorschau nach Kurs gruppiert, ungelesene Fristen/Mails priorisiert; höchstens sechs Vorschauen, Zähler bleibt echter Gesamtstand. |
| 22 | Empfehlungen erklären | Warum-Hinweis nennt tatsächlich fällige Karten, verfügbare Übungen oder anstehende Aufgabe; keine erfundene Schwäche. |
| 23 | Verständliche Texte | Neue Texte Deutsch/Englisch über i18n: Fokus beenden, Verbindung prüfen, Quelle öffnen etc. |
| 24 | Kleine erste Hilfe | Einzelner schließbarer PDF-Hinweis, gespeicherte Ausblendung; keine erzwungene Tour. |
| 25 | UX messen | 20 synthetische Missionen mit Klicks, Zeit, Status, Fehlern und Abbruch; JSON-Bericht, keine Produkt-Telemetrie. |

## Nachweise und Wiederholung

- `frontend/e2e/quality-missions.spec.ts`: 20 Missionen; vom Test selbst gemessene DOM-Klicks und Ablaufzeit.
- `frontend/e2e/workspace-restore.spec.ts`: PDF-Seite 47, Zoom/Scroll, Suche, Editorcursor und Touch-Sheet.
- `frontend/e2e/quality-gallery.spec.ts`: 11 Hauptansichten jeweils Hell/Dunkel bei 1440/390 px.
- [Galerie und Herkunft](qa/ux-quality-20261004/README.md).
- [Missionsbericht](qa/ux-quality-20261004/missions.json).

```powershell
# Nach einem Frontend-Build, ausschließlich mit den lokalen Fake-Diensten:
npm run e2e:focused --prefix frontend -- quality-missions.spec.ts workspace-restore.spec.ts
cd frontend
node scripts/quality-report.mjs test-results ../docs/qa/<neuer-pruefstand>/missions.json
```

Der Bericht ersetzt keine Nutzerstudie. Zeiten enthalten Navigation, Interaktion
und Assertions am lokalen Fake-Server. Klicks zählen DOM-Click-Ereignisse, auch
Tastaturaktivierungen; `fill()` und Tastendrücke sind keine gezählten Klicks.
Ohne vorab gemessenen Vergleich gibt es keine seriöse Prozentzahl für eine
allgemeine Beschleunigung. Optionale Nutzungszähler in der App bleiben lokal und
standardmäßig ausgeschaltet; die Testmessung wird nicht in die App eingebaut.

## Praktische Grenzen

Die Bilder verwenden erfundene Fixtures. Lange Vollseitenaufnahmen zeigen feste
Navigationsleisten an ihrer ursprünglichen Viewport-Position. Native Windows-/
macOS-/Linux-Fenster, Bildschirmtastatur, Sleep/Resume, echtes Hochschul-SSO und
frische Alpha-Geräte brauchen weiterhin manuelle Prüfung; siehe
[MANUELL_TESTEN](MANUELL_TESTEN.md). Docker Desktop läuft auf diesem PC nicht,
daher ist der lokale Docker-Smoke nicht ausführbar. Dieser Pass verändert kein
Datenbankschema und wurde nicht am persönlichen Serverbestand migriert.
