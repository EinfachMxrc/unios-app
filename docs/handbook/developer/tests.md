<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Tests und Fake-Daten

Die Testumgebung darf sich nicht bei echten Hochschulsystemen anmelden. Für Portal- und Sync-Abläufe dienen lokale Fake-Server und erfundene Fixtures.

## Während der Arbeit

Führe zuerst die betroffenen pytest- oder Vitest-Tests sowie die passenden statischen Checks aus. Vor einem Paket-Commit kommen die zugehörigen Browserabläufe dazu. Bei Integrationsänderungen und am Phasenende gelten die vollständigen Läufe aus [AGENTS.md](https://github.com/EinfachMxrc/unios-app/blob/main/AGENTS.md).

## Persönliche Abnahme

Automatisierte Tests ersetzen keine Prüfung mit eigenem Hochschulkonto, Gerät oder Anki-Profil. Die erforderlichen Schritte stehen in [MANUELL_TESTEN.md](https://github.com/EinfachMxrc/unios-app/blob/main/docs/MANUELL_TESTEN.md). Berichte solche Prüfungen getrennt von Fake-Server-Ergebnissen.
