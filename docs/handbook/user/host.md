<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Host und Standby

UniOS ist ein Einzelnutzer-System mit einem schreibenden Host. Weitere Geräte können dessen Daten zunächst lesend anzeigen.

## Was die Rollen bedeuten

Der Host führt Sync und Schreibvorgänge aus. Ein Standby soll keine konkurrierenden Änderungen erzeugen. Die Host-Rolle wird beim ersten Start gewählt und kann später nur über die vorgesehenen Übergabeschritte wechseln.

## Vor einem Wechsel

Erstelle einen geprüften Snapshot, beende Schreibvorgänge auf dem bisherigen Host und kontrolliere die Synchronisierung. Bei unklarer Erreichbarkeit oder einem Doppel-Host-Konflikt ist eine automatische Übernahme nicht sicher. Die konkrete Übergabe und ihre noch offenen Prüfungen stehen im [Betriebshandbuch](https://github.com/EinfachMxrc/unios-app/blob/main/docs/SERVICES.md).
