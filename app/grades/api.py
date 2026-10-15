# SPDX-License-Identifier: AGPL-3.0-or-later

"""Private grade dashboard; manual records stay distinct from future PRIMUSS data."""

from datetime import datetime
from decimal import Decimal
from typing import Literal, cast
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update

from app.db.models import AcademicModule, AcademicModuleRevision, Semester, utc_now
from app.grades.calculation import calculate, decimal_text, hundredths
from app.grades.history import module_snapshot
from app.host.lease import HostCoordinator

ModuleStatus = Literal["open", "passed", "failed"]


class ModuleInput(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    semester_id: int | None = Field(default=None, gt=0)
    ects: Decimal = Field(gt=0, le=120, max_digits=5, decimal_places=2)
    grade: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    weight: Decimal | None = Field(default=None, gt=0, le=1000, max_digits=6, decimal_places=2)
    attempt: int | None = Field(default=None, ge=1, le=20)
    status: ModuleStatus

    @model_validator(mode="after")
    def validate_status(self):
        self.title = self.title.strip()
        if not self.title:
            raise ValueError("Modulname fehlt")
        if self.status == "open" and self.grade is not None:
            raise ValueError("Offene Module haben keine tatsächliche Note")
        return self


class ModuleUpdate(ModuleInput):
    expected_revision: int = Field(ge=1)


class ArchiveInput(BaseModel):
    expected_revision: int = Field(ge=1)


class ScenarioInput(BaseModel):
    grades: dict[int, Decimal] = Field(default_factory=dict, max_length=100)


class GradeModuleView(BaseModel):
    id: int
    source: str
    title: str
    semester_id: int | None
    semester_name: str | None
    ects: str
    grade: str | None
    weight: str | None
    attempt: int | None
    status: ModuleStatus
    revision: int
    archived_at: datetime | None
    updated_at: datetime


class EctsView(BaseModel):
    planned_ects: str
    earned_ects: str
    hypothetical_ects: str


class SemesterEctsView(EctsView):
    semester_id: int | None
    semester_name: str | None = None


class GradeDashboard(BaseModel):
    modules: list[GradeModuleView]
    semesters: list[SemesterEctsView]
    overall: EctsView
    average: str | None
    average_basis: Literal["no_grades", "ects", "entered_weight"]
    weighting_complete: bool
    scenario_average: str | None
    scenario_basis: Literal["no_grades", "ects", "entered_weight"] | None
    scenario_weighting_complete: bool | None


def _view(item: AcademicModule, semesters: dict[int, str]) -> GradeModuleView:
    return GradeModuleView(
        id=item.id, source=item.source, title=item.title, semester_id=item.semester_id,
        semester_name=semesters.get(item.semester_id) if item.semester_id is not None else None,
        ects=decimal_text(item.ects_hundredths),
        grade=decimal_text(item.grade_hundredths) if item.grade_hundredths is not None else None,
        weight=decimal_text(item.weight_hundredths) if item.weight_hundredths is not None else None,
        attempt=item.attempt, status=cast(ModuleStatus, item.status), revision=item.revision,
        archived_at=item.archived_at, updated_at=item.updated_at,
    )


def _dashboard(session, hypothetical: dict[int, Decimal] | None = None,
               include_archived: bool = False) -> GradeDashboard:
    modules = session.scalars(select(AcademicModule)
                              .order_by(AcademicModule.title, AcademicModule.id)).all()
    active = [item for item in modules if item.archived_at is None]
    semesters = {item.id: item.name for item in session.scalars(select(Semester)).all()}
    summary = calculate(active, hypothetical)
    return GradeDashboard(
        modules=[_view(item, semesters) for item in modules if include_archived or item.archived_at is None],
        semesters=[SemesterEctsView(**row, semester_name=semesters.get(row["semester_id"])
                                     if row["semester_id"] is not None else None)
                   for row in summary["semesters"]],
        overall=EctsView(**summary["overall"]),
        average=summary["average"], average_basis=summary["average_basis"],
        weighting_complete=summary["weighting_complete"],
        scenario_average=summary["scenario_average"], scenario_basis=summary["scenario_basis"],
        scenario_weighting_complete=summary["scenario_weighting_complete"],
    )


def _validate_semester(session, semester_id: int | None) -> None:
    if semester_id is not None and session.get(Semester, semester_id) is None:
        raise HTTPException(422, "Semester nicht gefunden")


def _values(payload: ModuleInput) -> dict:
    return {"title": payload.title, "semester_id": payload.semester_id,
            "ects_hundredths": hundredths(payload.ects),
            "grade_hundredths": hundredths(payload.grade) if payload.grade is not None else None,
            "weight_hundredths": hundredths(payload.weight) if payload.weight is not None else None,
            "attempt": payload.attempt, "status": payload.status}


def grade_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/grades", tags=["grades"])

    @router.get("", response_model=GradeDashboard)
    def dashboard(include_archived: bool = False):
        with factory() as session:
            return _dashboard(session, include_archived=include_archived)

    @router.post("/scenario", response_model=GradeDashboard)
    def scenario(payload: ScenarioInput):
        with factory() as session:
            modules = session.scalars(select(AcademicModule).where(AcademicModule.archived_at.is_(None))).all()
            open_ids = {item.id for item in modules if item.status == "open"}
            if any(module_id not in open_ids or not grade.is_finite() or grade < 0 or grade > 100
                   or grade * 100 != (grade * 100).to_integral_value()
                   for module_id, grade in payload.grades.items()):
                raise HTTPException(422, "Hypothetische Noten nur für offene Module mit zwei Dezimalstellen")
            return _dashboard(session, payload.grades)

    @router.post("", response_model=GradeModuleView, status_code=201)
    def create_module(payload: ModuleInput):
        coordinator.assert_writer()
        with factory() as session:
            _validate_semester(session, payload.semester_id)
            item = AcademicModule(source="manual", source_key=uuid4().hex, revision=1,
                                  created_at=utc_now(), updated_at=utc_now(), **_values(payload))
            session.add(item)
            session.flush()
            session.add(AcademicModuleRevision(module_id=item.id, revision=1, snapshot=module_snapshot(item)))
            session.commit()
            semesters = {semester.id: semester.name for semester in session.scalars(select(Semester)).all()}
            return _view(item, semesters)

    @router.put("/{module_id}", response_model=GradeModuleView)
    def change_module(module_id: int, payload: ModuleUpdate):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(AcademicModule, module_id)
            if item is None or item.archived_at is not None:
                raise HTTPException(404, "Modul nicht gefunden")
            if item.source != "manual":
                raise HTTPException(403, "Portalnoten können hier nicht geändert werden")
            _validate_semester(session, payload.semester_id)
            result = session.execute(update(AcademicModule)
                                     .where(AcademicModule.id == module_id,
                                            AcademicModule.revision == payload.expected_revision)
                                     .values(**_values(payload), revision=item.revision + 1,
                                             updated_at=utc_now()))
            if result.rowcount != 1:
                session.rollback()
                raise HTTPException(409, "Modul wurde zwischenzeitlich geändert")
            session.flush()
            session.refresh(item)
            session.add(AcademicModuleRevision(module_id=item.id, revision=item.revision,
                                               snapshot=module_snapshot(item)))
            session.commit()
            semesters = {semester.id: semester.name for semester in session.scalars(select(Semester)).all()}
            return _view(item, semesters)

    @router.post("/{module_id}/archive", response_model=GradeModuleView)
    def archive_module(module_id: int, payload: ArchiveInput):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(AcademicModule, module_id)
            if item is None or item.archived_at is not None:
                raise HTTPException(404, "Modul nicht gefunden")
            if item.source != "manual":
                raise HTTPException(403, "Portalnoten können hier nicht geändert werden")
            result = session.execute(update(AcademicModule)
                                     .where(AcademicModule.id == module_id,
                                            AcademicModule.revision == payload.expected_revision)
                                     .values(archived_at=utc_now(), revision=item.revision + 1,
                                             updated_at=utc_now()))
            if result.rowcount != 1:
                session.rollback()
                raise HTTPException(409, "Modul wurde zwischenzeitlich geändert")
            session.flush()
            session.refresh(item)
            session.add(AcademicModuleRevision(module_id=item.id, revision=item.revision,
                                               snapshot=module_snapshot(item)))
            session.commit()
            semesters = {semester.id: semester.name for semester in session.scalars(select(Semester)).all()}
            return _view(item, semesters)

    @router.post("/{module_id}/restore", response_model=GradeModuleView)
    def restore_module(module_id: int, payload: ArchiveInput):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(AcademicModule, module_id)
            if item is None or item.archived_at is None:
                raise HTTPException(404, "Archiviertes Modul nicht gefunden")
            if item.source != "manual":
                raise HTTPException(403, "Portalnoten können hier nicht geändert werden")
            result = session.execute(update(AcademicModule)
                                     .where(AcademicModule.id == module_id,
                                            AcademicModule.revision == payload.expected_revision)
                                     .values(archived_at=None, revision=item.revision + 1,
                                             updated_at=utc_now()))
            if result.rowcount != 1:
                session.rollback()
                raise HTTPException(409, "Modul wurde zwischenzeitlich geändert")
            session.flush()
            session.refresh(item)
            session.add(AcademicModuleRevision(module_id=item.id, revision=item.revision,
                                               snapshot=module_snapshot(item)))
            session.commit()
            semesters = {semester.id: semester.name for semester in session.scalars(select(Semester)).all()}
            return _view(item, semesters)

    return router
