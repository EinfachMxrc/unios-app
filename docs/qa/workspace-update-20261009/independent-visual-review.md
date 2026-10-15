<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Unabhängige abschließende Sichtprüfung

Quellrevision: `6f3f39ae3b5e0f966fd8dac9733efd218e175947`.
Geprüft wurden die finalen Bilder `workflows/source-*`, `workflows/resume-*`
und `workflows/calendar-*` im hellen und dunklen Thema bei 1440 und 390 Pixeln.
Die Heute-Bilder der separaten Galerie wurden ergänzend betrachtet.

Die geprüften Ansichten zeigen keine seitlich abgeschnittenen Hauptaktionen,
Navigationselemente, Quellensteuerung oder Eingabefelder. Auf dem Desktop stehen
PDF und bearbeitbare Mitschrift nebeneinander. Mobil erscheint die Mitschrift
im Dialog; Schließen, Formel- und Lernhelferaktionen, Notizfeld und Anlegen sind
im aufgenommenen 1000 Pixel hohen Ausschnitt sichtbar. Heute bietet Fortsetzen,
schnelle Notiz und Studientag vor der nachgeordneten Aktivitätsliste an. Der
Kalender wechselt mobil zur Tagesliste und behält Datumsauswahl und Ansichtswechsel.

Das finale dunkle Desktop-PDF ist gerendert: Das Bild in Originalauflösung zeigt
den erfundenen Seitentitel, Quellensatz und die orangefarbene Textmarkierung.
Eine vorherige gebündelte Bildausgabe erschien bei diesem kleinen Textmaßstab
leer; die Prüfung der Originaldatei klärt diese Beobachtung auf. SHA-256 des
geprüften dunklen Bildes:
`5463852a3f492ed05696acbb9a1df80302584f3255655a41bcbce2936988bd6a`.

Die feste untere Navigation erscheint in langen mobilen Ganzseitenbildern an
der Grenze des ersten sichtbaren Ausschnitts. Dieses Aufnahmeverhalten belegt
keinen Fehler mit unerreichbaren Inhalten. Die Bilder belegen weder echtes
Safari-/MacBook-Trackpad-Verhalten noch die Ergonomie mit eingeblendeter
Bildschirmtastatur oder eine mit Handschrift vergleichbare Unterrichtsgeschwindigkeit.
Diese Punkte bleiben Geräte- und Nutzertests.

Während dieser unabhängigen Abschlussprüfung wurden keine Produktänderungen
vorgenommen. Automatische Kontrast- und Klickzielprüfungen sind separat in
`lighthouse/summary.json` dokumentiert.
