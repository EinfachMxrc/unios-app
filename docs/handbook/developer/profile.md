<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Hochschulprofile

Ein Profil kombiniert Connectoren und Konfiguration für eine Hochschule. Eine neue Einrichtung braucht keinen Fork des Core.

## Profil anlegen

Beginne mit dem neutralen Profil und ergänze nur nachgewiesene URLs und Fähigkeiten. Die konkreten Dateien liegen unter institutions/. Connector-Bindungen müssen zur geprüften Registry passen. Unbekannte Hochschulwerte bleiben ausdrücklich offen; keine URL oder Portalstruktur wird geraten.

## Prüfen und beitragen

Validiere Registry und Profil mit python -m scripts.validate_connector_registry. Teste gegen lokale Fake-Server und anonymisierte Fixtures. Echte Anmeldung, MFA und fachliche Vollständigkeit werden anschließend gesondert mit einem berechtigten Konto geprüft. Der [Connector-Vertrag](https://github.com/EinfachMxrc/unios-app/blob/main/docs/CONNECTOR_PLUGINS.md) erklärt die Bindung.
