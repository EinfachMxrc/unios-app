<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# UX-Galerie · 04.10.2026

44 Playwright-Aufnahmen der tatsächlichen Oberfläche, ausschließlich lokale
Fake-Server und erfundene Kurs-/Notizdaten. Jeweils `light`/`dark` und
1440/390 px: Heute, Kurse, Lernen, Termine, Suche, Programmieren, Üben,
Einstellungen, Weitere Bereiche, Notizeditor und PDF-Leser.

Aufnahme: `frontend/e2e/quality-gallery.spec.ts`. Die Dateien sind Vollseitenbilder;
feste Navigation kann daher in der Bildmitte erscheinen. Browserüberschriften
und Betriebssystemfenster werden nicht aufgenommen. Diese Bilder dokumentieren
den Entwicklungsstand nach Alpha1, nicht die unveränderten Release-Installer.

Alle 44 Aufnahmen wurden einzeln visuell geprüft: Überschriften, Abstände,
Formularbeschriftungen, Toolbar-Umbruch, Suchmarkierungen, Editor und PDF.
Die getrennten Touch-Tests prüfen die Vorschau zusätzlich im tatsächlichen
Viewport; ein Vollseitenbild allein kann deren Erreichbarkeit nicht belegen.

Abnahme: 254 Playwright, 425 Vitest und 827 Python-Tests bestanden (12 Python-
Tests übersprungen). Lighthouse Accessibility und Legacy-PWA jeweils 100.
20 Missionsfälle bestanden ohne Testfehler oder Abbruch. Diese Zahlen gelten für
die Fake-Prüfung; die Grenzen der Geräteprüfung stehen im Umsetzungsbericht.

[Missionsdaten](missions.json) · [Umsetzung und Grenzen](../../UX_QUALITY.md)
