# SPDX-License-Identifier: AGPL-3.0-or-later

"""Manual module results and hypothetical grades use no university account."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import AcademicModule, AcademicModuleRevision, Semester
from app.grades.calculation import calculate
from app.main import create_app


def test_manual_ects_average_scenario_and_revision_history(settings, factory, coordinator):
    with factory() as session:
        session.add(Semester(name="Erfundenes Semester", is_current=True))
        session.commit()
        semester_id = session.scalar(select(Semester.id))
    assert semester_id is not None
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        passed = client.post("/api/grades", json={
            "title": "Erfundene Mathematik", "semester_id": semester_id, "ects": "5.00",
            "grade": "1.30", "attempt": 1, "status": "passed",
        })
        assert passed.status_code == 201, passed.text
        passed_id = passed.json()["id"]
        open_module = client.post("/api/grades", json={
            "title": "Erfundene Informatik", "semester_id": semester_id, "ects": "10.00",
            "status": "open",
        })
        assert open_module.status_code == 201, open_module.text
        open_id = open_module.json()["id"]
        dashboard = client.get("/api/grades")
        assert dashboard.headers["cache-control"] == "private, no-store"
        assert dashboard.json()["overall"] == {
            "planned_ects": "15.00", "earned_ects": "5.00", "hypothetical_ects": "0.00"}
        assert dashboard.json()["average"] == "1.30"
        assert dashboard.json()["average_basis"] == "ects"

        scenario = client.post("/api/grades/scenario", json={"grades": {str(open_id): "2.00"}})
        assert scenario.status_code == 200
        assert scenario.json()["scenario_average"] == "1.77"
        assert scenario.json()["overall"]["hypothetical_ects"] == "10.00"
        assert next(item for item in client.get("/api/grades").json()["modules"]
                    if item["id"] == open_id)["grade"] is None
        assert client.post("/api/grades/scenario", json={"grades": {str(passed_id): "1.00"}}).status_code == 422

        updated = client.put(f"/api/grades/{passed_id}", json={
            "title": "Erfundene Mathematik", "semester_id": semester_id, "ects": "5.00",
            "grade": "1.70", "weight": "2.00", "attempt": 1, "status": "passed",
            "expected_revision": 1,
        })
        assert updated.status_code == 200 and updated.json()["revision"] == 2
        assert client.put(f"/api/grades/{passed_id}", json={
            "title": "Veralteter Stand", "semester_id": semester_id, "ects": "5.00",
            "grade": "1.00", "status": "passed", "expected_revision": 1,
        }).status_code == 409
        assert client.post(f"/api/grades/{open_id}/archive",
                           json={"expected_revision": 1}).status_code == 200
        assert client.get("/api/grades").json()["overall"]["planned_ects"] == "5.00"
        archived = client.get("/api/grades?include_archived=true").json()["modules"]
        assert any(item["id"] == open_id and item["archived_at"] for item in archived)
        assert client.post(f"/api/grades/{open_id}/restore",
                           json={"expected_revision": 2}).status_code == 200

    with factory() as session:
        revisions = session.scalars(select(AcademicModuleRevision)
                                    .where(AcademicModuleRevision.module_id == passed_id)
                                    .order_by(AcademicModuleRevision.revision)).all()
        assert [item.snapshot["grade_hundredths"] for item in revisions] == [130, 170]


def test_partial_official_weights_fall_back_to_explicit_ects_average():
    first = AcademicModule(id=1, semester_id=None, ects_hundredths=500,
                           grade_hundredths=100, weight_hundredths=300, status="passed")
    second = AcademicModule(id=2, semester_id=None, ects_hundredths=500,
                            grade_hundredths=300, weight_hundredths=None, status="passed")
    partial = calculate([first, second])
    assert (partial["average"], partial["average_basis"]) == ("2.00", "ects")
    second.weight_hundredths = 100
    complete = calculate([first, second])
    assert (complete["average"], complete["average_basis"]) == ("1.50", "entered_weight")
