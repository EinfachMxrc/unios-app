<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Alpha-Fokus: Sichtprüfung vom 04.10.2026

Gebautes React-Frontend mit lokalem Fake-Server, künstliche Daten, keine echte
Hochschulanmeldung. Vier Hauptbereiche, gleiche Reihenfolge auf Desktop/Handy,
leere Bibliothek verborgen, technische Werkzeuge eingeklappt und weiterhin
erreichbar. Alle vier Aufnahmen manuell angesehen.

| Ansicht | Light | Dark |
| --- | --- | --- |
| Desktop 1440 px | [Aufnahme](more-light-1440.png) | [Aufnahme](more-dark-1440.png) |
| Handy 390 px | [Aufnahme](more-light-390.png) | [Aufnahme](more-dark-390.png) |

Playwright: `frontend/e2e/alpha-navigation.spec.ts`, ergänzt um gespeicherte
Layouts, Kursverknüpfungen und Windows-/macOS-Tastaturhinweise.
Die Handyaufnahmen zeigen die gesamte Scrollseite; die feste Fußnavigation liegt
im Screenshot auf der Höhe des anfänglichen Viewports. Während der Bedienung bleibt
sie unten im sichtbaren Fenster, der Inhalt ist darüber scrollbar.

## Hauptseiten

Die vier Hauptseiten ebenfalls in allen vier Varianten selbst angesehen, insgesamt
20 archivierte Aufnahmen einschließlich „Weitere Bereiche“. Die folgenden Seiten
verwenden das erweiterte Testprofil, damit bestehende Bibliothek/Kursverknüpfungen
ebenfalls sichtbar geprüft werden. Der einfache Standard ist in den oberen Aufnahmen
belegt. Alle Inhalte und Kalendertermine sind erfunden.

| Seite | Light Desktop | Dark Desktop | Light Handy | Dark Handy |
| --- | --- | --- | --- | --- |
| Heute | [Aufnahme](today-light-desktop.png) | [Aufnahme](today-dark-desktop.png) | [Aufnahme](today-light-phone.png) | [Aufnahme](today-dark-phone.png) |
| Kurse | [Aufnahme](courses-light-desktop.png) | [Aufnahme](courses-dark-desktop.png) | [Aufnahme](courses-light-phone.png) | [Aufnahme](courses-dark-phone.png) |
| Lernen | [Aufnahme](learning-light-desktop.png) | [Aufnahme](learning-dark-desktop.png) | [Aufnahme](learning-light-phone.png) | [Aufnahme](learning-dark-phone.png) |
| Termine | [Aufnahme](calendar-light-desktop.png) | [Aufnahme](calendar-dark-desktop.png) | [Aufnahme](calendar-light-phone.png) | [Aufnahme](calendar-dark-phone.png) |

Bei der Sichtprüfung versetzte mobile Kalenderpfeile gefunden und korrigiert:
Datum zuerst, darunter Zurück/Weiter zusammen und Heute rechts. Nach dem Fix
Kalenderabläufe und die breite Screenshotprüfung erneut ausgeführt; fünf Tests
bestanden. Endgültige Kalenderaufnahmen erneut angesehen.

Die bestehende breite Sichtprüfung in `ux-audit.spec.ts` erfasst weitere Hauptseiten
in Light/Dark bei 1440/390 px. Automatisierte Überlauf-/Headerprüfungen ersetzen
keine native Betriebssystemmatrix. Diese Aufnahmen sind Entwicklungsnachweise und
ersetzen nicht die Screenshots des unveränderlichen Alpha1-Releases.

## Weitere Nachweise und Grenzen

Vollständiger Integrationslauf: 229 Playwright-, 413 Frontend- und 827 Python-Tests
bestanden (zwölf Python-Tests übersprungen). Notizentwürfe, Wiederherstellung und
Konfliktentscheidung außerdem dreimal wiederholt: 15 bestandene Abläufe. Der
sporadische Zugriff auf zerstörte Editorinstanzen wurde in Leser und Editor behoben.

Lighthouse prüft die gebaute Startseite mit Fake-Server; Accessibility 100.
PWA-Dateien und Produktionsauslieferung sind in den Browserabläufen geprüft.
Docker-Smoke lokal nicht ausführbar, da kein Docker-Daemon läuft. Keine Prüfung
gegen echte Konten, kein neues natives Installationspaket und kein VPS-Deployment
dieses Entwicklungsstands.
