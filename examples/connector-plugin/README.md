<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Connector-Beispiel

Dieses separat installierbare Paket liefert nur erfundene Hochschuldaten. Es demonstriert die öffentliche [Connector API v1](../../docs/CONNECTOR_PLUGINS.md).

Das Paket demonstriert den Vertrag. Für die isolierte Variante aus dem Repo-Root `docker build -f examples/connector-plugin/Dockerfile .` ausführen. Das Dockerfile-spezifische Ignore-Muster beschränkt den Build-Kontext auf den öffentlichen SDK-Code und das Beispiel. Erst ein veröffentlichtes Image mit festem SHA-256-Digest und Registry-Review darf in der App installiert werden; der lokale Build ist kein geprüfter Community-Release.

Für den **lokalen Entwicklermodus** kann das Python-Paket mit `uv pip install -e examples/connector-plugin` installiert werden. Sein Entry Point `unios.connectors.v1` heißt `example_university`. Das neutrale Profil `generic` bindet ihn ein. `unios connectors list` zeigt das Manifest. Für den Host-Prozess sind eine explizite Freigabe, `CONNECTOR_PLUGINS=example_university` und `ALLOW_TRUSTED_PYTHON_CONNECTORS=true` in der privaten `.env` nötig. Python-Connectoren besitzen keine Prozessisolation und lassen sich nicht über die sichere GUI installieren.

Für eine echte Hochschule Paketname, Entry Point, Manifest und Profilbindung anpassen. Tests nur mit erfundenen Daten oder lokalem Fake-Server ausführen. Der Beispielcode ist AGPL-3.0-or-later.
