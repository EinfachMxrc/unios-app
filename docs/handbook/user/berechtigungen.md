<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Connector-Berechtigungen

Ein Connector bringt Daten aus einer externen Quelle in UniOS. Sein Manifest nennt Version, Fähigkeiten, Domains und Secret-Aliase.

## Vor der Freigabe

Prüfe, welcher Connector zu deinem Hochschulprofil gehört und welche Daten er lesen soll. Installation und Freigabe sind getrennte Schritte. Ändert sich das Manifest, verliert die alte Freigabe ihre Wirkung.

## Aktueller Sicherheitsstand

Community-Connectoren sollen in einem getrennten, begrenzten Container laufen. Ohne geprüftes Image starten sie nicht. Die Registry enthält derzeit nur ein lokales Python-Beispiel; ein veröffentlichtes Container-Image und Signaturen stehen aus. Die Details stehen in der [Connector API v1](https://github.com/EinfachMxrc/unios-app/blob/main/docs/CONNECTOR_PLUGINS.md).
