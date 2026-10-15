# SPDX-License-Identifier: AGPL-3.0-or-later

"""The same entity contract feeds REST, MCP and the generated reference."""

from fastapi.testclient import TestClient

from app.db.models import Course
from app.entities.schema import catalog
from app.main import create_app
from scripts.build_entity_reference import render


def test_schema_contract_and_safe_entity_projection(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="schema-course", name="Diskrete Mathematik")
        session.add(course)
        session.commit()
        course_id = course.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        result = client.get("/api/schema")
        assert result.status_code == 200
        assert result.json() == catalog().model_dump()
        assert client.get("/api/schema/note").json()["kind"] == "note"
        assert client.get("/api/entities/course", params={"q": "Diskrete"}).json()[0]["id"] == course_id
        assert client.get("/api/entities/course", params={"q": "Analysis"}).json() == []
        assert client.get(f"/api/entities/course/{course_id}").json()["name"] == "Diskrete Mathematik"
        assert client.get("/api/entities/course/999").status_code == 404
        assert client.get("/api/entities/unknown").status_code == 422
    assert "`prerequisite`" in render()
    assert "`course`" in render()


def test_field_contract_exposes_references_and_real_write_permissions():
    contract = catalog()
    assert contract.version == 2
    note = next(item for item in contract.entities if item.kind == "note")
    fields = {field.name: field for field in note.fields}
    assert fields["course_id"].type == "entity_ref"
    assert fields["course_id"].reference_type == "course"
    assert fields["id"].read_only and not fields["id"].nullable
    assert fields["title"].writable and not fields["title"].read_only
    assert fields["current_revision"].read_only
    assignment = next(item for item in contract.entities if item.kind == "assignment")
    assert next(field for field in assignment.fields if field.name == "delivery").enum_values == ["unknown", "in_person", "online"]
    assert all(field.read_only != field.writable for entity in contract.entities for field in entity.fields)
