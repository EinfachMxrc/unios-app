<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Installation

Der Installationshelfer richtet die lokale App und den Hintergrunddienst ein. Für die Alpha solltest du vor der Einrichtung persönlicher Daten den aktuellen [Projektstand](https://github.com/EinfachMxrc/unios-app/blob/main/docs/PROGRESS.md) und die [manuelle Abnahme](https://github.com/EinfachMxrc/unios-app/blob/main/docs/MANUELL_TESTEN.md) lesen.

## macOS

Im Repository startet sh scripts/install-mac.sh den Installationshelfer. Er baut Frontend und Backend und öffnet den Einrichtungsassistenten. Die Schritte für einen dauerhaft laufenden Dienst stehen im [Betriebshandbuch](https://github.com/EinfachMxrc/unios-app/blob/main/docs/SERVICES.md).

## Windows

In PowerShell lautet der Einstieg powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1. Prüfe nach der Installation, ob die App lokal erreichbar ist und der Dienst nach einem Neustart wieder startet.

## Linux

Für Linux sind systemd- und Docker-Compose-Vorlagen dokumentiert. Ihre tatsächliche Einrichtung hängt von der Distribution ab. Nutze die Kommandos im Betriebshandbuch und führe den dort beschriebenen Smoke-Test aus, bevor du persönliche Daten übernimmst.
