<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Self-Hosting

UniOS ist für selbst betriebene Einzelinstallationen gedacht. Der persönliche Host bleibt die einzige schreibende Instanz.

## Dienst einrichten

Die Installationsskripte decken macOS und Windows ab. Für Linux sind systemd und Docker Compose im [Betriebshandbuch](https://github.com/EinfachMxrc/unios-app/blob/main/docs/SERVICES.md) beschrieben. Stelle die Web-App und API nur lokal oder über das vorgesehene private Netz bereit.

## Betrieb absichern

Plane Dienststart, Snapshot, externes Backup und Wiederherstellung zusammen. Syncthing kann Dateien zwischen Geräten abgleichen; es ersetzt keine Host-Übergabe und kein Backup. Prüfe auf den eigenen Geräten die Leserechte des Standbys und das Verhalten bei einem Doppel-Host-Konflikt. Die aktuellen offenen Punkte stehen in der [manuellen Abnahme](https://github.com/EinfachMxrc/unios-app/blob/main/docs/MANUELL_TESTEN.md).
