<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Kalender: Unterrichtstag sichtbar halten

Marcs Screenshot zeigte einen großen Kopf und ein starres Zeitraster, das den
realen Unterrichtstag unten abschnitt. Dieses UI-Arbeitspaket verkleinert den
Kopf, passt die Stundenhöhe automatisch an und ergänzt die große Ansicht.
Die Abnahme benutzt ausschließlich erfundene Termine, darunter Donnerstag
16:00–17:30; persönliche Bestände und Hochschulsysteme wurden nicht gelesen.

## Verhalten und Komponenten

- Die Arbeitswoche bleibt die Standardansicht. „Einpassen“ orientiert sich an
  08–18 Uhr und erweitert diesen Bereich für frühere/spätere Termine. Die
  vollständigen 24 Stunden bleiben durch Scrollen erreichbar.
- „Große Ansicht“ öffnet denselben Kalender in einem zugänglichen Radix-Dialog.
  In den geprüften 1300×820- und 1280×720-Fenstern liegen sämtliche zehn
  Unterrichtsblöcke einschließlich 17:30 innerhalb des tatsächlichen Fensters.
  Escape schließt zunächst einen geöffneten Termin-/Bearbeitungsdialog, danach
  die große Ansicht und setzt den Fokus auf ihren Öffner zurück.
- Manuelle Stundenhöhe, Ansichtswechsel und lokale Einstellungen bleiben
  erhalten. Automatisch berechnete Pixelwerte werden nicht in die Einstellungen
  geschrieben. Einpassen stellt auch nach manuellem Scrollen den Unterrichtstag
  wieder her. Normales Scrollen bleibt möglich; Strg-Wheel zoomt am Zeiger.
- Während Ziehen/Größenänderung bleibt die Kalendergeometrie fest. Die
  Verschiebung wird weiterhin auf Viertelstunden eingerastet. Fehler, Konflikte,
  Rückgängig und alternative Bearbeitung im Formular bleiben erhalten.
- Bei 390 px bleibt die Tagesliste mit vollständigem Titel, Zeit und Raum
  bedienbar. Eine große Schrift darf die Wochenüberschrift umbrechen.

Inline beträgt die minimale Stundenhöhe 44 px, in der großen Übersicht 32 px.
Sehr kurze oder überlappende Blöcke sowie 150 % Schrift können einzelne
Metadaten abkürzen; ihr vollständiger zugänglicher Name und der Detaildialog
enthalten weiterhin die Originalangaben. Für einen extremen 24-Stunden-Bereich
wird die Schrift nicht beliebig zusammengedrückt: Hinweise führen zu Terminen
vor/nach dem gerade sichtbaren Ausschnitt. Die Inlinekarte kann weiterhin
äußeres Seitenscrollen benötigen; nur die große Ansicht ist als vollständige
Fensterübersicht geprüft.

## Prüfungen

- 30 gezielte Vitesttests in sechs Dateien bestanden; Typecheck, vollständiges
  ESLint und de/en-Prüfung für 67 Namespaces bestanden.
- Produktions-/PWA-Build bestanden. Bestehende Warnungen zu großen Paketen und
  zur MathLive-Fontauflösung bleiben erhalten; die Fonts liegen im Build.
- 26 Browserfälle gemeinsam bestanden: `calendar-visibility`, `calendar-apple`,
  `calendar-editing`, `calendar-polish` und `calendar-workweek`, ein Worker,
  ausschließlich lokale Fake-Dienste. Endlauf: 31,6 Sekunden.
- Darin enthalten: frühe/späte Termine und eine Fensteränderung während einer
  aktiven Ziehgeste. Escape bricht zuerst die Geste ab und hält den Kalender offen.

Gefundene Fehler wurden vor der Übergabe repariert: Die erste große Ansicht
erhielt ihre DOM-Referenz erst nach dem Portal-Mount und begann dadurch bei
00:00. Ein Elementzustand koppelt nun Messung und Scroll-/Wheel-Listener an den
tatsächlichen Mount. Beim Schließen duplizierte die Portal-Presence kurz den
Inline-Öffner und verlor den Tastaturfokus; die große Ansicht wird jetzt vor der
Inline-Rückkehr entfernt. Ein pixelgenauer Verschiebetest geriet nach dem
zusätzlichen Werkzeugknopf in die absichtliche Rand-Autoscrollzone; seine
Startposition liegt nun mittig im Raster, während die Produktfunktion erhalten
bleibt. Der Randfall mit Escape während des Ziehens deckte die Reihenfolge
zwischen Dialog und Gesten-Handler auf; der Dialog fängt nun nur diesen Zustand
ab, sodass die Geste ohne Speicherung endet. Frühere Bilddateien und lokale
Fehlbelege wurden nicht überschrieben.

## Bilder des bestandenen Endlaufs

Die große Ansicht wurde als echte Fensteraufnahme erzeugt. Inline-/Handybilder
sind Ganzseitenaufnahmen und beweisen keine vollständige Fensterübersicht.
Beide Darstellungen wurden vom ausführenden Agenten und zusätzlich unabhängig
begutachtet; der Browser prüft auch die tatsächlichen Blockgrenzen.

| Ansicht | Dunkel | Hell |
| --- | --- | --- |
| Inline 1300×820 | [Bild](calendar-fit-dark-1300-820-1791626079598.png) | [Bild](calendar-fit-light-1300-820-1791626079681.png) |
| Inline 1280×720 | [Bild](calendar-fit-dark-1280-720-1791626081395.png) | [Bild](calendar-fit-light-1280-720-1791626081472.png) |
| Groß 1300×820 | [Bild](calendar-large-dark-1300-820-1791626080404.png) | [Bild](calendar-large-light-1300-820-1791626080455.png) |
| Groß 1280×720 | [Bild](calendar-large-dark-1280-720-1791626082173.png) | [Bild](calendar-large-light-1280-720-1791626082223.png) |
| Inline 150 % | [Bild](calendar-fit-150-dark-1300-820-1791626084448.png) | [Bild](calendar-fit-150-light-1300-820-1791626084710.png) |
| Groß 150 % | [Bild](calendar-large-150-dark-1300-820-1791626084988.png) | [Bild](calendar-large-150-light-1300-820-1791626085100.png) |
| Tagesliste 390 px | [Bild](calendar-agenda-dark-390-1791626083731.png) | [Bild](calendar-agenda-light-390-1791626083786.png) |
| Tagesliste 390 px, 150 % | [Bild](calendar-agenda-150-dark-390-1791626085363.png) | [Bild](calendar-agenda-150-light-390-1791626085492.png) |

## Auslieferungsstand

Quellcode und geprüfter lokaler Frontend-Build sind fertig. Dieses Paket enthält
keine neue Abhängigkeit, Datenbankmigration oder Versionsanhebung. Die installierte
Windows-App 0.1.23 und der Server wurden für dieses UI-Arbeitspaket nicht ersetzt.
Eine spätere native Auslieferung benötigt einen vollständigen UI-/Sidecar-Bau
und den unabhängig geprüften normalen Windows-Installationsweg.
