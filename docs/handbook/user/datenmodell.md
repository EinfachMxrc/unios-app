<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Daten und Kurse

UniOS ordnet Informationen nach Semester, Kurs und Material. Aufgaben, Termine, Notizen und Lernarbeit können auf diese Einträge verweisen, damit du vom Kontext zur nächsten Handlung gelangst.

## Originale und Arbeitsdaten

Heruntergeladene Materialien werden als unveränderliche Versionen verwahrt. Markierungen und Fragen liegen daneben; sie schreiben die ursprüngliche PDF nicht um. Eigene Notizen haben ebenfalls eine Versionshistorie. So bleibt ein früherer Stand nachvollziehbar.

## Lokal und privat

Der Host speichert Metadaten in SQLite und Dateien im lokalen Bestand. Zusätzliche Geräte sollen den Host zunächst nur lesend nutzen. Bevor du den Host wechselst oder Daten migrierst, brauchst du einen geprüften Snapshot. Die Details stehen in der [Betriebsdokumentation](https://github.com/EinfachMxrc/unios-app/blob/main/docs/SERVICES.md).
