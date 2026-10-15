<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# REST API

FastAPI stellt die lokale Schnittstelle für Web-App und CLI bereit. Ein laufender Host liefert sein Schema unter /openapi.json; im Repository liegt ein exportierter Stand unter frontend/openapi.json.

## Vertrag prüfen

Verwende die generierte API-Referenz für vorhandene Methoden und Pfade. Parameter, Rückgaben und Fehlercodes sind im OpenAPI-Schema genauer beschrieben. Die CLI kann einen Endpunkt mit uv run unios api GET /api/courses --port 8766 --pretty abfragen, wenn die Demo läuft.

## Schreiben

Schreibende Operationen benötigen die jeweilige Sitzungsberechtigung und einen aktiven Host. Die CLI verlangt für ihre schreibenden Methoden eine ausdrückliche Bestätigung. Hochschul-Abgaben gehören zu einem gesonderten UI-Ablauf. Eine rohe API-Anfrage ist kein Ersatz für dessen Bestätigungen.
