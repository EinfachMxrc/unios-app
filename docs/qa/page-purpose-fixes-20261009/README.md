<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Seiten- und Bedienungsupdate 0.1.23

Dieses Paket setzt die bestätigten Fehler aus dem Seitenaudit in eigenem UniOS-Code um.
Keine neue Abhängigkeit, keine Alembic-Migration.

| Nutzerreibung | Bedienkonzept | Umsetzung |
| --- | --- | --- |
| Eine späte Speicherantwort verwirft neue Eingaben | Bestätigten Stand vom aktuellen Entwurf trennen | Coding, Eingang, Karteneditor, Regeln, Journal, Sprachmemos und Noten erhalten Identitäts-/Generationsprüfungen; Dirty-Refetch übernimmt keinen fremden Text |
| PDF-Abschnitte erzeugen viele einzelne Mitschriften | Eine quellengebundene Mitschrift fortsetzen | Erster POST erzeugt die UUID; weitere Exzerpte und Textänderungen verwenden den normalen Notizeditor mit vorhandenen Revisionen und Konfliktbehandlung; ausdrücklich neue Mitschrift bleibt möglich |
| Speicherfehler werden als sichere lokale Kopie dargestellt | Aktueller Text bleibt im Fenster, ehrliche Fehlerrückmeldung | RAM-Fallback bei abgelehnter Notizspeicherung; Entwurfgrenzen bleiben von begrenztem Navigationsverlauf getrennt; RAM ersetzt keine Sicherung nach Appende |
| Große Lernlisten werden extrem lang | Vorschau, Suche und begrenzte Seiten | Lernstart mit fünf Übungen; vollständige Übungsliste mit zehn Einträgen; Vorschläge mit zehn Zusammenfassungen und einem offenen Editor; Kartenvorschläge mit zwanzig sichtbaren Zeilen und passender Sammelfreigabe |
| Sammelfreigabe ignoriert sichtbare Korrekturen | Nur den sichtbaren, unveränderten Bestand freigeben | Dirty-/Pending-Zeilen sperren Sammelaktion und Seitenwechsel; ein POST enthält genau die angekündigten IDs |
| Notizübersicht verdrängt die Arbeit auf kleinen Displays | Dokument zuerst, Notizwechsel bewusst öffnen | Seitliche Liste auf Desktop, wechselbare Liste auf Mobilgeräten; Eigenschaften hinter Details; Fokusmodus verhindert den Notizwechsel nicht |
| Projektfristen hängen von der Gerätezone ab | Campus-Uhrzeit direkt eintippen | UTC an der API-Grenze, Europe/Berlin für Projekt-/Mailfelder; DST-Lücken werden zurückgewiesen und gespeicherte zweite Herbststunde bleibt erhalten |
| Fristenseite vermischt Kalender und Abgaben | Nächste Frist zuerst, gespeicherte Hauptansicht | Kalender-/Abgabenumschaltung, Quellenstatus mit getrenntem Laden/Fehler/nicht eingerichtet; brauchbare Daten bleiben bei Refetchfehler sichtbar |
| Kleine Termine und Hover-Aktionen sind schwer bedienbar | Inhalt nach verfügbarer Höhe, feste Aktionsflächen | Kalender-Titel/Zeit/Ort mit vollständigem zugänglichem Namen; Sidebar reserviert Desktop-Slot und bietet 44×44px bei grobem Zeiger; bestehende Drag-/Resize-/Undo-Protokolle erhalten |
| Seitenwechsel und Quellenabgleich stören den Fokus | Passiver Metadatenabgleich verändert den Lesefokus nicht | Kurs-, Block- und Zyklusreader behalten Fokus/Scroll bei Seiten- und Notizhandle-Abgleich; wirkliche Navigation bleibt normal |
| Ein Startdialog oder eine andere Fensterbreite verfälscht die Leseposition | Dialogende und Readerbereitschaft berücksichtigen | Nach bereits gesehenem Startdialog mit wartendem Reader bleibt die Navigation auch über fünf Sekunden und den ersten Frame nach Dialogende hinaus wartend; gleiche Breite bei Zurück-Navigation verwendet den Pixeloffset, ein Wechsel von 1440 auf 390 Pixel die semantische Readerseite; 45 betroffene Browserfälle einschließlich des mobilen Neuladefalls bestanden |
| Einstellungen zeigen zu viel gleichzeitig | Einen Bereich wählen | Allgemein, Darstellung, Erinnerungen, Daten und Feedback als Desktopnavigation und mobile Auswahl; bestehende Formzustände bleiben montiert |
| Gesammelte Gedanken sind schwer weiterzuverwenden | Zuordnung von tatsächlicher Übernahme unterscheiden | Jots mit Seiten und direktem UUID-Ziel; explizite Übernahme in vorhandene Notiz mit Live-CAS/Hostgeneration und Quellenlink als Wiederholungsschutz; Originalgedanke bleibt erhalten |
| Verknüpfungen oder Ergebnisse wirken leer/falsch | Tatsächliche Quelle und Eingaben berücksichtigen | Ungefilterte Kursübersicht, Office-Quellen im Arbeitsbereich, vollständige Sammlungstermine, besuchsgebundener Alle-Filter, normale Syncdetails und fingerprintgebundene Erweiterungsergebnisse |

Die Backend- und Frontend-Abnahmen, die betroffene Browserregression und die
erneute Lighthouse-Prüfung sind nach den letzten Reader-/Navigationskorrekturen
abgeschlossen. Der ursprüngliche vollständige Browserlauf mit einem Fehler
bleibt erhalten; die genaue zusammengesetzte Abdeckung steht unten. Installation
und Paketbildung haben eigene technische Belege. Die ausführlichen
Teilergebnisse stehen im [Organisationsbeleg](../page-purpose-audit-20261009/organization-fixes.md),
und [Reader-/Übungsbeleg](../page-purpose-audit-20261009/reader-exercise-regressions.md).

Windows- und Serverupdate, Paketupload und Rückdownload sind abgeschlossen;
Prüfsummen, tatsächliche Installationsgrenzen und der blockierte externe
CI-Lauf stehen im [Auslieferungsbeleg](DELIVERY.md).

| Prüfung | Nachgewiesener Stand | Abschluss am neuesten Stand |
| --- | --- | --- |
| Vollständiges Backend | 1094 Fälle: 1082 bestanden, zwölf übersprungen, keine Fehler oder fehlgeschlagenen Tests; 1592,26 Sekunden | Abgeschlossen |
| Python und API-Vertrag | Ruff über 617 Pythondateien, mypy über 589 Quelldateien; OpenAPI- und API-Prüfungen grün | Abgeschlossen |
| Frontend | 965 Vitest-Tests in 118 Dateien (131,55 Sekunden), vollständiges ESLint und Typecheck im finalen Frontendbau bestanden | Abgeschlossen |
| Vollständiger Browserlauf | Ursprünglicher 390-Fälle-Lauf: 389 bestanden, ein Fall fehlgeschlagen | Keine vollständige Erfolgsaussage für den neuesten Stand |
| Betroffene Browserabläufe | 45 Fälle in sechs Specs am endgültigen Toolbar-/Navigationsstand bestanden (1,9 Minuten) | Abgeschlossen, einschließlich korrigierter Bildprüfung und zusätzlichem mobilem Neuladen |
| Lighthouse und Bildprüfung | Zwölf vollständig gerenderte finale Ansichten mit 96–100 Accessibility-Punkten; 24 Aufnahmen der sechs Hauptansichten selbst und unabhängig geprüft | Abgeschlossen |

Für den endgültigen Frontendbau bestehen die PWA-Precache- und
Bundlegrößenprüfungen: 290 eindeutige Dateien, 18.117.964 Rohbytes und
5.095.863 gzip-Bytes innerhalb der festgelegten Grenzen. Die zwölf finalen
Lighthouse-Ansichten zeigen keinen seitlichen Überlauf, Browserfehler oder
externen Abruf. Der endgültige Quellstand ist vor der Paketbildung gegen
634 kanonische Frontend-Eingabehashes gegen den tatsächlich gepackten Commit
`84c5af45c6372daee58cedef881d5d0613b12477` geprüft.

Die gezielte Browserregression umfasst 45 bestandene Fälle, darunter direkte
PDF-Seitenlinks, neue App-Tabs, Zurück-Navigation mit exaktem Scrolloffset,
120-seitige Quellen und offline erhaltene Mitschriften. Direkte PDF-Positionen
werden erst nach abgeschlossener Reader-Hydrierung freigegeben; die allgemeine
Arbeitsbereichsnavigation überschreibt diese Position nicht mit ihrem
Standard-Nullscroll. Ein gespeicherter Zurück-Navigationsoffset behält Vorrang.
Der ursprüngliche vollständige Lauf bleibt mit 389 bestandenen und einem
fehlgeschlagenen Fall erhalten. Der korrigierte Bildtest und der zusätzliche
Neuladefall bestehen im abschließenden betroffenen Lauf. Zusammen decken die
Belege alle 391 aktuellen Browserfälle ab; dies ist ausdrücklich kein einzelner
vollständig grüner 391-Fälle-Lauf. Die vier seit dem ursprünglichen Lauf
geänderten Frontend-Eingaben und die passenden Wiederholungen sind erfasst.

Die jüngste Navigationskorrektur wartet bei bereits beobachtetem Startdialog
und noch nicht bereitem Reader auch nach fünf Sekunden weiter. Das gilt
ebenso für den ersten Frame nach dem Schließen des Dialogs, bis die
Readerposition bereit ist. Bei gleicher Fensterbreite stellt die Zurück-Navigation
den exakten Pixeloffset wiederherstellen; beim Wechsel von 1440 auf 390 Pixel
wird die semantische Readerseite statt des Desktopoffsets verwendet. Diese
Komponentenlogik ist durch Unit- und Browserregressionen belegt. Der neue Fall
prüft gleiche Breite, tatsächliches Scrollen, Neuladen mit geöffneter Mitschrift
über 6,5 Sekunden und anschließend die sichtbare gerenderte Seite zwölf sowie
den exakten Offset. Ein zuvor außerhalb des Bildschirms liegender Mitschriftknopf
hatte beim Öffnen die Ansicht von 5962 auf 266 Pixel versetzt. Der vorhandene
Knopf sitzt nun in der festen PDF-Leiste; der Test verlangt seine Sichtbarkeit
vor dem Klick und einen unveränderten Öffnungsoffset. Der Bildtest scrollt das
mobile Textfeld mit dem normalen Browserverhalten in die Mitte seines Sheets;
die ursprünglichen vollständigen Sichtbarkeits- und Begrenzungsprüfungen bleiben.

Im vorherigen Pythonlauf waren 1074 Fälle bestanden und zwölf übersprungen;
ein Fall scheiterte im Testaufbau, ein weiterer im Testablauf. Ein Timeout von Windows `taskkill`
entwich dem Parser-Abbruchpfad und wurde als Syncfehler weitergegeben. Der
vorausgehende Parser-Timeout wird aus Laufzeit und Ablauf abgeleitet; der
alte Befund bewahrt diese ursprüngliche Ursache nicht direkt. Der korrigierte Abbruchpfad
bestätigt Baumabbruch und Reaping oder meldet ausdrücklich Cleanupfehler mit
der ursprünglichen Ursache. 14 gezielte Fälle einschließlich echter
Windows-Kindprozesse und Fehler-Injektion bestehen. Die zweite Störung war
ein nicht gestarteter Test-Host vor seinem ersten Heartbeat. Seine längste
Start-I/O-Pfadlänge beträgt 176 Zeichen und überschreitet MAX_PATH nicht;
der genaue historische Auslöser ist weiterhin nicht bewiesen. Der bestandene
Abschlusslauf verwendet dieselbe Sammlung, ergänzt um sechs Abbruchfälle,
mit 1094 Fällen in exakt geprüfter Reihenfolge und frischen ausschließlich
synthetischen OS-Temp-Daten. Beide zuvor gestörten Fälle, der echte sofortige
Parser-Abbruch und sämtliche neuen Windows-Abbruchregressionen bestehen nun
im vollständigen Lauf. Ein bestimmter OneDrive- oder Lock-Auslöser folgt
aus diesem Ergebnis nicht. JUnit, Log-Prüfsummen und die unveränderten Hashes
der zwei Parserdateien sind gegen den Abschlussbeleg geprüft.

Echte MacBook-Trackpadgesten und Mitschrifttempo im Unterricht sind weiterhin
Geräteprüfungen aus MANUELL_TESTEN. Ein synthetischer Browserlauf belegt keine
Geschwindigkeitsgleichheit mit iPad/Pencil. Die bestehende Plattformfreigabe
wird separat geprüft; eine lokale Windows-/Serverprüfung ersetzt sie nicht.
