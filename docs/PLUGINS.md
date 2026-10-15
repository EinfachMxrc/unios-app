<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Connectoren entwickeln

Die verbindliche [Connector API v1](CONNECTOR_PLUGINS.md) beschreibt Manifest, Registry, Berechtigungen und Sicherheitsgrenze. Das [Beispielpaket](../examples/connector-plugin/) zeigt den Einstieg.

Feature- und UI-Addons haben noch keine installierbare API. Ihr getrenntes [Architekturzielbild](EXTENSIONS.md) ist für die Zeit nach dem Connector-Nachweis und der Beta festgehalten.

`create_connector(context: ConnectorContext)` gibt ein Objekt mit `name` und `check_auth`, `list_courses`, `fetch_changes`, `download`, `health` zurück. Die Datenklassen werden aus `app.connectors.sdk` importiert. Die Sync-Engine ruft `fetch_changes` einmal pro Lauf und `download` nur für neue oder geänderte Ressourcen auf. Connectoren laufen nacheinander. Stabile Remote-Schlüssel zusammen mit dem Connector-Namen vermeiden Duplikate.

Für ein öffentliches Paket: eigenes Manifest mit exakter Paketversion zur Review einreichen, Profilbindung ergänzen, rein erfundene Fixtures testen und Änderungen an Fähigkeiten oder Domains offenlegen. Ein Review der Registry ist Voraussetzung, bevor UniOS den Code laden kann. Die API-Version bleibt für v1 kompatibel; ein Bruch erhält v2.
