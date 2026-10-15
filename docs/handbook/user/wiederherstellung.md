<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Wiederherstellung

Eine Wiederherstellung soll einen geprüften Datenstand auf einem funktionsfähigen Host zurückbringen. Die genaue Folge hängt davon ab, ob du einen lokalen Snapshot oder ein externes Restic-Backup nutzt.

## Sicherer Ablauf

1. Stoppe den schreibenden Dienst.
2. Wähle den zu prüfenden Snapshot beziehungsweise Backup-Stand.
3. Stelle zunächst in einer getrennten Umgebung wieder her.
4. Prüfe Datenbank, Dateiversionen und die wichtigsten Kursabläufe.
5. Aktiviere erst danach den vorgesehenen Host.

Überschreibe keinen persönlichen Bestand durch einen ungetesteten Restore. Für Docker-Hosts und Betriebssystemdienste enthält [SERVICES.md](https://github.com/EinfachMxrc/unios-app/blob/main/docs/SERVICES.md) die konkreten Schritte.
