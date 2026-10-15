# SPDX-License-Identifier: AGPL-3.0-or-later

"""Versioned public contract for UniOS entities and semantic links."""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import inspect

EntityKind = Literal["course", "resource", "jot", "note", "project", "topic", "assignment", "exam", "exercise", "coding_task", "coding_attempt", "assessment_task", "assessment_attempt"]
RelationKind = Literal["related", "prerequisite", "explains", "exercise_for", "part_of", "duplicate", "prepares_for"]
Capability = Literal["read", "list", "search", "relate", "unlink"]
FieldType = Literal["string", "long_text", "integer", "float", "boolean", "date", "datetime", "enum", "entity_ref", "list", "object"]
IdType = Literal["integer", "uuid"]


class EntityRef(BaseModel):
    type: EntityKind
    id: str = Field(min_length=1, max_length=36)


class FieldDefinition(BaseModel):
    name: str
    type: FieldType
    required: bool = False
    description: str
    read_only: bool = True
    writable: bool = False
    nullable: bool = True
    enum_values: list[str] = Field(default_factory=list)
    reference_type: EntityKind | None = None
    item_type: FieldType | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.read_only == self.writable:
            raise ValueError("Schreibrecht und Leseschutz widersprechen sich")
        if self.type == "entity_ref" and self.reference_type is None:
            raise ValueError("Referenz benötigt einen Objekttyp")
        if self.type == "enum" and not self.enum_values:
            raise ValueError("Auswahl benötigt gültige Werte")
        if self.enum_values and self.type != "enum":
            raise ValueError("Auswahlwerte benötigen den Typ enum")
        return self


class EntitySchema(BaseModel):
    kind: EntityKind
    label: str
    id_type: IdType
    fields: list[FieldDefinition]
    capabilities: list[Capability]
    rest_path: str
    actions: list[dict[str, Any]] = Field(default_factory=list)


class RelationshipDefinition(BaseModel):
    kind: RelationKind
    forward_label: str
    reverse_label: str
    symmetric: bool = False


class SchemaCatalog(BaseModel):
    version: int = 2
    entities: list[EntitySchema]
    relationships: list[RelationshipDefinition]


_SPECS: tuple[tuple[EntityKind, str, IdType, str, tuple[tuple[str, FieldType, str], ...]], ...] = (
    ("course", "Kurs", "integer", "name", (("short_name", "string", "Kurzname"), ("semester_id", "integer", "Semester"))),
    ("resource", "Material", "integer", "name", (("course_id", "integer", "Kurs"), ("kind", "string", "Art"))),
    ("jot", "Schnellerfassung", "uuid", "body", (("course_id", "integer", "Kurs"), ("kind", "string", "Art"))),
    ("note", "Notiz", "uuid", "title", (("course_id", "integer", "Kurs"), ("current_revision", "integer", "Version"))),
    ("project", "Projekt", "integer", "name", (("course_id", "integer", "Kurs"), ("deadline_at", "datetime", "Frist"))),
    ("topic", "Lernthema", "integer", "name", (("course_id", "integer", "Kurs"), ("slug", "string", "Kurzform"))),
    ("assignment", "Aufgabe", "integer", "title", (("course_id", "integer", "Kurs"), ("due_at", "datetime", "Frist"))),
    ("exam", "Prüfung", "integer", "title", (("course_id", "integer", "Kurs"), ("exam_at", "datetime", "Termin"))),
    ("exercise", "Übung", "integer", "question", (("topic_id", "integer", "Lernthema"),)),
    ("assessment_task", "Lernaufgabe", "integer", "title", (("course_id", "integer", "Kurs"), ("topic_id", "integer", "Lernthema"))),
    ("assessment_attempt", "Lernantwort", "integer", "title", (("course_id", "integer", "Kurs"),)),
    ("coding_task", "Coding-Aufgabe", "integer", "title", (("course_id", "integer", "Kurs"), ("topic_id", "integer", "Lernthema"))),
    ("coding_attempt", "Coding-Versuch", "integer", "title", (("course_id", "integer", "Kurs"), ("task_id", "integer", "Coding-Aufgabe"))),
)

RELATIONSHIPS = (
    RelationshipDefinition(kind="related", forward_label="verknüpft mit", reverse_label="verknüpft mit", symmetric=True),
    RelationshipDefinition(kind="prerequisite", forward_label="Voraussetzung für", reverse_label="setzt voraus"),
    RelationshipDefinition(kind="explains", forward_label="erklärt", reverse_label="wird erklärt durch"),
    RelationshipDefinition(kind="exercise_for", forward_label="ist Übung zu", reverse_label="hat Übung"),
    RelationshipDefinition(kind="part_of", forward_label="ist Teil von", reverse_label="enthält"),
    RelationshipDefinition(kind="duplicate", forward_label="ist Duplikat von", reverse_label="ist Duplikat von", symmetric=True),
    RelationshipDefinition(kind="prepares_for", forward_label="bereitet vor auf", reverse_label="wird vorbereitet durch"),
)

# Explicit public fields: reflecting every column would expose internal source
# identifiers. References preserve their scalar IDs in entity projections.
_EXTRA: dict[EntityKind, tuple[tuple[str, FieldType, str], ...]] = {
    "course": (("is_active", "boolean", "Aktiver Kurs"),),
    "resource": (("group_category", "enum", "Kursgruppe"), ("removed_upstream", "boolean", "Nicht mehr in der Quelle")),
    "note": (("updated_at", "datetime", "Letzte Änderung"),),
    "project": (("members", "list", "Projektmitglieder"), ("links", "list", "Projektlinks"), ("todos", "list", "Projektaufgaben")),
    "assignment": (("description", "long_text", "Aufgabenbeschreibung"), ("delivery", "enum", "Abgabeart")),
    "exercise": (("solution", "long_text", "Lösung"), ("difficulty", "enum", "Schwierigkeit")),
}
_ENUMS = {
    "group_category": ["general", "own_group", "other_group", "unassigned"],
    "delivery": ["unknown", "in_person", "online"],
    "difficulty": ["easy", "medium", "hard"],
}
_REFERENCES: dict[str, EntityKind] = {"course_id": "course", "topic_id": "topic", "task_id": "coding_task"}
# Flags describe actual domain APIs/actions; they do not grant permissions.
_WRITABLE = {("course", "is_active"), ("note", "title"), ("jot", "body"),
             ("project", "name"), ("project", "members"), ("project", "links"), ("project", "todos")}


def _field(kind: EntityKind, name: str, field_type: FieldType, description: str) -> FieldDefinition:
    from app.entities.repository import MODELS

    column = inspect(MODELS[kind]).columns[name]
    reference = _REFERENCES.get(name)
    if reference:
        field_type = "entity_ref"
    if name in {"body", "question"}:
        field_type = "long_text"
    writable = (kind, name) in _WRITABLE
    return FieldDefinition(name=name, type=field_type, description=description,
                           required=not column.nullable, nullable=column.nullable,
                           writable=writable, read_only=not writable,
                           enum_values=_ENUMS.get(name, []), reference_type=reference,
                           item_type="object" if field_type == "list" else None)


def catalog() -> SchemaCatalog:
    from app.entities.actions import action_definitions

    entities = []
    for kind, label, id_type, title_field, extra in _SPECS:
        fields = [_field(kind, "id", "string" if id_type == "uuid" else "integer", "Stabile Kennung"),
                  _field(kind, title_field, "string", "Anzeigename")]
        fields.extend(_field(kind, name, field_type, description)
                      for name, field_type, description in (*extra, *_EXTRA.get(kind, ())))
        entities.append(EntitySchema(kind=kind, label=label, id_type=id_type, fields=fields,
                                     capabilities=["read", "list", "search", "relate", "unlink"],
                                     rest_path=f"/api/entities/{kind}",
                                     actions=[item.model_dump() for item in action_definitions(kind)]))
    return SchemaCatalog(entities=entities, relationships=list(RELATIONSHIPS))


def describe(kind: EntityKind) -> EntitySchema:
    return next(item for item in catalog().entities if item.kind == kind)


def relationship(kind: RelationKind) -> RelationshipDefinition:
    return next(item for item in RELATIONSHIPS if item.kind == kind)
