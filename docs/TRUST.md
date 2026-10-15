<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Daten und Vertrauen

UniOS ist eine offene persönliche Studienplattform unter AGPL-3.0-or-later.
Eine eigene lokale Instanz oder ein eigener Server verwaltet den Bestand.
Im gekoppelten Clientbetrieb liegen die Studiendaten auf dem gewählten Server;
der lokale Begleitprozess liefert die Oberfläche und authentifizierte Brücke.
Serverbetrieb braucht gepflegte TLS-, Betriebssystem- und Backup-Konfiguration.

## Zugriffe verstehen

- Hochschulanmeldung und MFA erfolgen persönlich auf der offiziellen Seite.
  Verbindungen brauchen je nach Dienst Tokens, Cookies oder Zugangsdaten; UniOS
  behauptet nicht, grundsätzlich ohne gespeicherte Geheimnisse auszukommen.
- Zugangsdaten gehören in den System-Schlüsselbund. Der Server-Schlüsselbund
  verwendet einen separat provisionierten privaten Schlüssel. Konfigurations-
  Fallbacks und ihre Rechte sind in der Betriebsdokumentation beschrieben.
- Work/optionale KI bekommen ausdrücklich freigegebene Kurse und Kategorien.
  Nicht freigegebene Quellen bleiben gesperrt; Entzug wird bei weiteren Abrufen
  geprüft. Bereits extern gelesene Daten kann UniOS nicht zurückrufen.
- Das Produkt braucht keine Cloud-KI. Ein bewusst aktivierter externer Adapter
  übermittelt erlaubten Kontext an dessen Anbieter; Kosten-/Zugriffsgrenzen
  ersetzen keine Prüfung der Anbieterbedingungen.
- PRIMUSS bleibt lesend. Moodle-Abgaben brauchen den gesonderten bestätigten
  Nutzerablauf. Agent-Werkzeuge führen keine Hochschulabgaben durch.
- Connector-Manifeste nennen Domains, Fähigkeiten und Secret-Aliase. Installation,
  Freigabe und Aktivierung sind getrennt. Lokale Trusted-Python-Connectoren sind
  Entwicklercode im Hostprozess, keine Sandbox.
- Community-Container, deklarative Addons und begrenzte WASM-Worker haben
  unterschiedliche Grenzen. Hash-/Digestbindung ist keine Herkunftssignatur.

## Sicherung und Diagnose

Materialänderungen erhalten Versionen. Export und geprüfte Snapshots ermöglichen
Wiederherstellung; ein Datenbank-Snapshot allein ersetzt keinen vollständigen
Datei-/Medien-/Zugangsdaten-Backup. Wiederherstellung zuerst in einem getrennten
Ziel prüfen. Anleitungen: [Backup](handbook/user/backup.md), [SERVER](SERVER.md).

Der Diagnoseexport verwendet eine feste technische Feldliste: App-/Schema-Version,
Betriebssystem, Connector-Versionen, Host-/Sync-Status und Fehlercodes. Er enthält
keine Notiz-/PDF-Texte oder Zugangsdaten. Ein selbst eingegebener Fehlertext oder
Screenshot kann trotzdem Persönliches enthalten; vor dem bewussten Teilen prüfen.
Es wird keine pauschale anonyme Nutzungsmessung als eingerichtet behauptet.

## Bekannte Grenzen

### Desktop-Updatekanäle

Stable, Beta und Nightly sind vorbereitet; ein ausgewählter Kanal installiert
nichts automatisch. Die festen GitHub-Kanaladressen sind Entwürfe, keine Zusage
über einen bereits veröffentlichten Feed. Unsigned Builds zeigen keine native
Updateinstallation. Vor Installation prüfen UI und nativer Befehl einen frischen
Snapshot; der native Befehl verlangt zusätzlich den aktuellen Staffelstab und
blockiert Demo-/Recovery-Modus. Das ersetzt kein vollständiges Datei-Backup.

Tauri prüft die Artefaktsignatur und die signierte Paketversion. Mindestversion,
Kanal, Schema-Kompatibilität und Release-Notizen in `latest.json` bleiben dagegen
**unsignierte Metadaten**. Sie werden strukturell geprüft und dürfen keine fremden
Artefaktadressen zulassen; das ist keine Signatur über das gesamte Manifest.
Ein älterer Paketstand oder Schema-Downgrade wird nicht automatisch installiert.

Der eigene Manifestabruf ist auf 32 KiB begrenzt. Tauri Updater 2.13 benötigt
anschließend einen zweiten Abruf; dessen JSON wird auf Gleichheit geprüft,
sein Parser und sein Archivdownload haben jedoch keine harte Speichergrenze.
Ein tatsächlich signiertes Update-/Manipulations-/Abbruch-Drill bleibt vor der
öffentlichen Freigabe erforderlich. Fixturetests beweisen keine Signierkette.

UniOS ist ein Alpha-Projekt. Ein bestandener Fake-Server-Test bestätigt keine echte
Hochschul-MFA und kein installiertes Paket auf jedem Gerät. Die ehrliche Matrix
steht unter [Kompatibilität](COMPATIBILITY.md) und [Release-Abnahme](RELEASE_READINESS.md).
Sicherheitsmeldungen: [SECURITY](../.github/SECURITY.md). Technische Grenzen:
[Connectoren](CONNECTOR_PLUGINS.md), [Addons](ADDONS_V2.md), [Agent Gateway](AGENT_GATEWAY.md).
