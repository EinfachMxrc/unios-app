# SPDX-License-Identifier: AGPL-3.0-or-later

"""Build the public entity reference from the same catalog used by REST and MCP."""

from pathlib import Path

from app.entities.schema import catalog


def render() -> str:
    contract = catalog()
    lines = ["<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->", "",
             "# Entitäten und Beziehungen", "",
             f"Schemaversion: {contract.version}. Quelle: `app/entities/schema.py`.", "",
             "REST: `/api/schema`, `/api/schema/{kind}`, `/api/entities/{kind}` und",
             "`/api/entities/{kind}/{id}`. Listen akzeptieren `q`, `offset` und `limit`.",
             "CLI: `unios schema`, `unios describe`, `unios entity`.",
             "MCP: `get_entity_schema` gibt nur den Vertrag zurück, keine Studiendaten.", ""]
    for entity in contract.entities:
        lines.extend([f"## {entity.label} (`{entity.kind}`)", "",
                      f"Kennung: `{entity.id_type}`. Fähigkeiten: {', '.join(entity.capabilities)}.", "",
                      "| Feld | Typ | Pflicht | Nullable | Schreibbar | Referenz / Werte | Beschreibung |",
                      "| --- | --- | --- | --- | --- | --- | --- |"])
        lines.extend(f"| `{field.name}` | `{field.type}` | {field.required} | {field.nullable} | {field.writable} | "
                     f"{field.reference_type or ', '.join(field.enum_values) or field.item_type or '—'} | {field.description} |"
                     for field in entity.fields)
        lines.append("")
        if entity.actions:
            lines.extend(["### Aktionen", "", "| ID | Fähigkeit | Bestätigung | MCP |",
                          "| --- | --- | --- | --- |"])
            lines.extend(f"| `{action['id']}` | `{action['capability']}` | {action['requires_confirmation']} | {action['mcp_allowed']} |"
                         for action in entity.actions)
            lines.extend(["", "Eingabeschema: `GET /api/schema/" + entity.kind + "`.", ""])
    lines.extend(["## Beziehungen", "", "| Typ | Hinweg | Rückweg |", "| --- | --- | --- |"])
    lines.extend(f"| `{relation.kind}` | {relation.forward_label} | {relation.reverse_label} |"
                 for relation in contract.relationships)
    lines.extend(["", "Beziehungen sind gerichtet, außer `related` und `duplicate`. Eingehende Kanten ",
                  "erscheinen automatisch als Rückverweise. `unios relate` und `unios unlink` ",
                  "verlangen `--yes`; `--dry-run` prüft nur die beabsichtigte Änderung.", ""])
    return "\n".join(lines)


if __name__ == "__main__":
    Path("docs/handbook/developer/entities.md").write_text(render(), encoding="utf-8")
