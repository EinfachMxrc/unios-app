<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Schnellnavigation – 05.10.2026

Vier echte Chrome-Aufnahmen des neuen Quellstands, ausschließlich erfundene Daten
des lokalen Fake-Servers; alle vier visuell geprüft. Noch kein neuer Installer.

| | Desktop 1440 px | Handy 390 px |
|---|---|---|
| Hell | [Bild](recent-light-1440.png) | [Bild](recent-light-390.png) |
| Dunkel | [Bild](recent-dark-1440.png) | [Bild](recent-dark-390.png) |

Erzeugung nach Frontend-Build: `npm run e2e:focused -- recent-navigation.spec.ts`.
Die Originalaufnahmen entstehen im Testausgabeordner der Mission „palette reopens
a recently read note“. Diese dokumentierte Kopie wird vom normalen Testlauf nicht
überschrieben. Geprüft wurden Lesbarkeit, vollständige Bedienelemente,
Verlaufseintrag/Leeren und horizontaler Überlauf. Die Menüinhalte scrollen innerhalb
der Palette. [Umsetzungsstand und Grenzen](../../ENTRY_BARRIERS.md).
