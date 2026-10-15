<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Snapshots und Backups

Ein Snapshot hält einen konsistenten Stand vor Migration, Gerätewechsel oder Wiederherstellung fest. Ein Backup schützt erst dann vor Geräteverlust, wenn es außerhalb des betroffenen Geräts liegt.

## Vor einer Änderung

Erstelle den Snapshot mit dem vorgesehenen Host-Werkzeug und prüfe, dass er lesbar ist. Starte erst danach die Migration oder Übergabe. Ein lokales Test-Backup beweist den Ablauf, ersetzt aber kein externes Ziel.

## Dauerhaft absichern

Das Betriebshandbuch beschreibt Restic und die Dienstvorlagen. Wähle ein externes Ziel, schütze dessen Zugang und teste die Wiederherstellung mit einer entbehrlichen Kopie. Der aktuelle persönliche Betrieb ohne externes Ziel ist noch kein vollständiger Schutz gegen Geräteverlust. [Betriebshandbuch](https://github.com/EinfachMxrc/unios-app/blob/main/docs/SERVICES.md).
