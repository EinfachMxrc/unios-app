<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Connector API v1

Connectoren holen Daten aus externen Quellen in UniOS. Ein Hochschulprofil bindet die freigegebenen Connectoren an die jeweilige Einrichtung.

## Vertrag

create_connector(context) liefert ein Objekt mit check_auth, list_courses, fetch_changes, download und health. Der Sync ruft Connectoren nacheinander auf. Stabile Remote-Schlüssel und der Connector-Name verhindern Duplikate. Das [Beispielpaket](https://github.com/EinfachMxrc/unios-app/tree/main/examples/connector-plugin) verwendet nur erfundene Daten.

## Sicherheitsgrenze

Das Manifest enthält exakte Version, Fähigkeiten, Domains, Secret-Aliase und bei Containern einen festen Image-Digest. Community-Code läuft in einem begrenzten Docker-Container; Netzaufrufe vermittelt der Core. Lokale Python-Entry-Points erfordern eine zusätzliche Trusted-Einstellung und sind kein öffentlicher Installationsweg. [Vollständiger v1-Vertrag](https://github.com/EinfachMxrc/unios-app/blob/main/docs/CONNECTOR_PLUGINS.md).
