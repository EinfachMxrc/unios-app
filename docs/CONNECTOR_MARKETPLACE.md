<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Connector-Katalog und Community-Aufnahme

Unter **Weitere Bereiche → Connector-Katalog** stehen dieselben Profile und Manifeste,
die Core, CLI und Freigabeprüfung verwenden. Hochschulprofile kombinieren vorhandene
Connectoren; die Profilwahl wird gespeichert und nach dem angegebenen Neustart aktiv.

## Ein Container-Paket verwenden

1. Maintainer, Quelle, exakte Version, API-Version, Domains und Fähigkeiten prüfen.
2. Container installieren. Der Docker-Dienst muss erreichbar sein.
3. Die gezeigten Rechte für den konkreten Manifest-Fingerprint freigeben.
4. Connector aktivieren, sofern er zum gewählten Profil gehört.
5. Zugangsdaten ausschließlich in der vorgesehenen Connector-Konfiguration hinterlegen.
6. Freigabe widerrufen, um Ausführung und weitere Datenabfragen zu sperren.

Installation erteilt keine Freigabe. Das Python-Beispiel ist eine Referenz und wird
von der Oberfläche nicht als installierbarer Community-Code angeboten.

## Einen Eintrag beitragen

Ein Pull Request enthält Manifest, zugehöriges Hochschulprofil, nachvollziehbare
Quelle, Maintainer, Lizenz, exakte Paketversion und kompatible Public-API-Version.
Container werden durch ihren unveränderlichen Image-Digest gebunden. Nur benötigte
Domains, Fähigkeiten und Secret-Namen deklarieren; keine Zugangsdaten beitragen.

Die bestehenden Registry-Tests prüfen Manifest und Profilbindung. Vor Aufnahme
müssen Rechteentzug, isolierte Ausführung, Abbruch und Kompatibilität mit erfundenen
lokalen Daten geprüft werden. Ein Upgrade mit geändertem Manifest-Fingerprint
benötigt neue Zustimmung; eine alte Freigabe darf nicht still übernommen werden.
Die Prüfung realer Hochschul-Anmeldungen führt der jeweilige Nutzer selbst durch.

Der Katalog wird mit UniOS ausgeliefert. Es gibt noch keinen automatisch vertrauten
Remote-Store und keine Signaturverifikation. `unsigned` ist der tatsächliche Stand;
Fingerprint und Image-Digest ersetzen keine Maintainer-Signatur.
