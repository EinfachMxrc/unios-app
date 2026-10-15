<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Release 0.1.20: mobile Einrichtung und PDF-Abnahme

Die GitHub-Gesamtabnahme des ersten korrigierten Kandidaten `947bf59` bestand
unter Linux und macOS, fand aber zwei Browserprobleme (317 bestanden, zwei
fehlgeschlagen). Bei nicht verbundenem myCampus erzwingt die lange
Anmeldeschaltfläche eine Dokumentbreite von 406 px bei 390 und 320 px Viewport.
Der verbundene Zustand ist eine negative Kontrolle und zeigte keinen Überlauf.
Setup-Grid und Karte sind jetzt begrenzt; lange Aktionen umbrechen lesbar.

Die PDF-Abnahme wählte während des Seitenwechsels zusätzlich den vorgerenderten,
inaktiven Textpuffer. Ihre Selektoren adressieren jetzt ausdrücklich die aktive
Textebene. Die doppelte Darstellung bleibt als vorhandene Renderstrategie erhalten.

Alle 16 Fälle der vollständigen Specs `material`, `setup` und `ux-audit`
bestanden lokal ohne Skip, Retry oder unerwarteten Ausgang (75,31 s). Web-Build,
Typecheck und Lint bestanden. Ein zusätzlicher Setup-Fall prüft die vollständige
Dokumentbreite und die Aktionsgrenzen in beiden Themes bei 320 und 390 px.
Die vier untenstehenden Vollseitenbilder wurden einzeln visuell geprüft.
Ausschließlich synthetischer Testzustand; keine persönlichen Inhalte.

| Theme | 390 px | 320 px |
| --- | --- | --- |
| Hell | [Ansicht](setup-disconnected-light-390.png) | [Ansicht](setup-disconnected-light-320.png) |
| Dunkel | [Ansicht](setup-disconnected-dark-390.png) | [Ansicht](setup-disconnected-dark-320.png) |

Die vollständige GitHub-Matrix des endgültigen Quellstands und die daraus neu
gebauten Release-Pakete werden im Auslieferungsnachweis separat bestätigt.

Abschluss auf ausdrücklichen Nutzerwunsch vor Ende des langen Windows-CI-Laufs:
fünf Bereiche der [Matrix](https://github.com/EinfachMxrc/unios-app/actions/runs/37577907697)
bestanden, einschließlich aller 320 Browserfälle. Windows läuft weiter;
GitHub-Release bleibt ein Entwurf. Windows-PC und VPS mit dem neuen Paket
bereits erfolgreich aktualisiert. [Nachweis](validation-summary.json).

**Endgültige Freigabe:** Windows inzwischen ebenfalls bestanden (1018 Fälle,
neun Skips) und Windows-Service-Smoke erfolgreich. Alle sechs Matrixbereiche
sind am selben Quellstand grün. Das [Release 0.1.20](https://github.com/EinfachMxrc/unios-app/releases/tag/v0.1.20)
ist veröffentlicht; die JSON-Zusammenfassung enthält den endgültigen Nachweis.
