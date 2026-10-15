# SPDX-License-Identifier: AGPL-3.0-or-later

"""Material viewer API. Source files are never modified."""

import logging
from pathlib import PurePath
from uuid import UUID

import pymupdf
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response
from filelock import FileLock
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.config import Settings
from app.db.models import (
    AnkiCardQueue,
    Course,
    CourseScratchpad,
    MaterialAnnotation,
    QuestionExplanationQueue,
    Resource,
    ResourceVersion,
    utc_now,
)
from app.extract.service import document_markdown
from app.files.atomic import ensure_directory, write_once
from app.files.store import safe_name
from app.host.lease import HostCoordinator
from app.material.citations import citations_for
from app.material.preview import PreviewUnavailable, preview_pdf_path
from app.material.service import (
    MaterialError,
    annotations_for,
    create,
    current_event,
    delete_annotation,
    display,
    reanchor,
    resource_for,
    update,
)
from app.material.viewable import view_for
from app.web.schemas import (
    CourseMaterialView,
    DocumentView,
    LearningQuestionsView,
    MaterialAnnotationView,
    MaterialCitationsView,
    MaterialView,
)

log = logging.getLogger(__name__)


class AnnotationInput(BaseModel):
    id: UUID | None = None
    kind: str
    quote: str = Field(min_length=2, max_length=1000)
    page: int = Field(ge=1)
    comment: str = Field(default="", max_length=5000)
    rects: list[list[float]] | None = None


class AnnotationUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    comment: str = Field(max_length=5000)
    resolved: bool


class AnnotationReanchor(BaseModel):
    expected_revision: int = Field(ge=1)
    quote: str = Field(min_length=2, max_length=1000)
    page: int = Field(ge=1)
    rects: list[list[float]]


class ScratchpadInput(BaseModel):
    expected_revision: int = Field(ge=0)
    body: str = Field(max_length=10000)


def material_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter()

    @router.get("/api/learning/questions", response_model=LearningQuestionsView)
    def learning_questions():
        with factory() as session:
            approved = session.scalars(
                select(QuestionExplanationQueue).where(QuestionExplanationQueue.status == "approved")
                .order_by(QuestionExplanationQueue.id)
            ).all()
            answers = {item.question_id: item.answer for item in approved}
            rows = session.execute(
                select(MaterialAnnotation, Resource, Course)
                .join(Resource, Resource.id == MaterialAnnotation.resource_id)
                .join(Course, Course.id == Resource.course_id)
                .where(MaterialAnnotation.kind == "question")
                .order_by(MaterialAnnotation.created_at.desc())
            ).all()
            questions = []
            for item, resource, course in rows:
                latest = session.scalar(
                    select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                    .order_by(ResourceVersion.version.desc())
                )
                if latest is None:
                    continue
                try:
                    state = current_event(session, settings.data_dir, item)
                except MaterialError as exc:
                    raise HTTPException(409, str(exc)) from None
                questions.append({
                    "id": item.id, "course_id": course.id, "course_name": course.name,
                    "resource_name": resource.name, "version_id": latest.id, "quote": state["quote"],
                    "comment": state["comment"], "resolved": item.resolved,
                    "revision": item.revision,
                    "source_page": item.source_page, "approved_explanation": answers.get(item.id),
                })
            return {"questions": questions}

    def require_version(session, version_id: int):
        version = session.get(ResourceVersion, version_id)
        if version is None:
            raise HTTPException(404, "Material nicht gefunden")
        try:
            path = preview_pdf_path(settings.data_dir, version, allow_convert=coordinator.is_writer)
            resource = resource_for(session, version)
        except PreviewUnavailable as exc:
            raise HTTPException(503, str(exc)) from None
        except MaterialError as exc:
            raise HTTPException(404, str(exc)) from None
        return version, resource, path

    @router.get("/api/material/{version_id}", response_model=MaterialView)
    def get_material(version_id: int):
        with factory() as session:
            version, resource, _ = require_version(session, version_id)
            course = session.get(Course, resource.course_id)
            versions = session.scalars(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                                       .order_by(ResourceVersion.version.desc())).all()
            try:
                annotations = annotations_for(session, settings.data_dir, version)
            except MaterialError as exc:
                raise HTTPException(409, str(exc)) from None
            return {"version_id": version.id, "resource_id": resource.id, "resource_name": resource.name,
                    "course_id": resource.course_id, "course_name": course.name if course else "Kurs",
                    "version": version.version,
                    "versions": [{"id": item.id, "version": item.version} for item in versions],
                    "annotations": annotations}

    @router.get("/api/documents/{version_id}", response_model=DocumentView)
    def get_document(version_id: int):
        """Opens a file that has no PDF view as its extracted text, so it reads inside the app."""
        with factory() as session:
            version = session.get(ResourceVersion, version_id)
            resource = session.get(Resource, version.resource_id) if version else None
            if version is None or resource is None:
                raise HTTPException(404, "Dokument nicht gefunden")
            course = session.get(Course, resource.course_id)
            filename = PurePath(version.relative_path).name
            view = view_for(filename)
            return {"version_id": version.id, "resource_name": resource.name, "course_id": resource.course_id,
                    "course_name": course.name if course else "Kurs", "filename": filename,
                    "view": view[0] if view else "page", "size": version.size,
                    "markdown": "" if view else document_markdown(session, version.id)}

    @router.get("/api/material/{version_id}/citations", response_model=MaterialCitationsView)
    def material_citations(version_id: int):
        with factory() as session:
            version = session.get(ResourceVersion, version_id)
            if version is None:
                raise HTTPException(404, "Material nicht gefunden")
            return {"citations": citations_for(session, version)}

    @router.get("/api/courses/{course_id}/material", response_model=CourseMaterialView)
    def course_material(course_id: int):
        with factory() as session:
            if session.get(Course, course_id) is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            scratchpad = session.get(CourseScratchpad, course_id)
            linked = session.execute(select(
                func.json_extract(AnkiCardQueue.payload, "$.source_question_id"),
                func.count(AnkiCardQueue.id),
            ).join(Resource, Resource.id == AnkiCardQueue.resource_id).where(
                Resource.course_id == course_id,
                AnkiCardQueue.status != "rejected",
            ).group_by(func.json_extract(AnkiCardQueue.payload, "$.source_question_id"))).all()
            card_counts = {question_id: count for question_id, count in linked if question_id}
            questions = []
            annotations = []
            rows = session.execute(select(MaterialAnnotation, Resource).join(Resource, Resource.id == MaterialAnnotation.resource_id)
                                   .where(Resource.course_id == course_id)
                                   .order_by(MaterialAnnotation.created_at.desc())).all()
            for item, resource in rows:
                latest = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource.id)
                                        .order_by(ResourceVersion.version.desc()))
                if latest:
                    try:
                        state = current_event(session, settings.data_dir, item)
                    except MaterialError as exc:
                        raise HTTPException(409, str(exc)) from None
                    try:
                        found = display(session, settings.data_dir, latest, item)["anchor"]
                    except PreviewUnavailable:
                        found = {"status": "unmatched", "page": None}
                    except MaterialError as exc:
                        raise HTTPException(409, str(exc)) from None
                    annotations.append({"id": item.id, "resource_id": resource.id,
                                        "resource_name": resource.name, "version_id": latest.id,
                                        "kind": item.kind, "quote": state["quote"], "comment": state["comment"],
                                        "resolved": item.resolved, "page": found["page"],
                                        "anchor_status": found["status"],
                                        "linked_cards": card_counts.get(item.id, 0)})
                    if item.kind == "question":
                        questions.append({"id": item.id, "resource_name": resource.name, "version_id": latest.id,
                                          "quote": state["quote"], "comment": state["comment"], "resolved": item.resolved,
                                          "linked_cards": card_counts.get(item.id, 0)})
            return {"course_id": course_id, "scratchpad": scratchpad.body if scratchpad else "",
                    "scratchpad_revision": scratchpad.revision if scratchpad else 0,
                    "questions": questions, "annotations": annotations}

    @router.get("/api/courses/{course_id}/questions/export")
    def export_questions(course_id: int):
        material = course_material(course_id)
        with factory() as session:
            course = session.get(Course, course_id)
            if course is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            title = course.name
        lines = [f"# Offene Fragen: {title}", ""]
        for item in material["annotations"]:
            if item["kind"] != "question" or item["resolved"]:
                continue
            place = f"Seite {item['page']}" if item["page"] else "Stelle prüfen"
            lines.append(f"- {item['resource_name']} · {place}: „{item['quote'].replace(chr(10), ' ')}“")
            if item["comment"]:
                lines.append(f"  Frage: {item['comment'].replace(chr(10), ' ')}")
        if len(lines) == 2:
            lines.append("Keine offenen Fragen.")
        return Response("\n".join(lines) + "\n", media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="fragen-kurs-{course_id}.md"',
                                 "Cache-Control": "private, no-store"})

    @router.put("/api/courses/{course_id}/material/scratchpad", response_model=CourseMaterialView)
    def save_scratchpad(course_id: int, payload: ScratchpadInput):
        coordinator.assert_writer()
        folder = ensure_directory(settings.data_dir / "notes")
        with FileLock(folder / f"{course_id}.lock", timeout=5), factory() as session:
            course = session.get(Course, course_id)
            if course is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            item = session.get(CourseScratchpad, course_id)
            if (item.revision if item else 0) != payload.expected_revision:
                raise HTTPException(409, "Kurstext wurde inzwischen geändert")
            if item is None:
                item = CourseScratchpad(course_id=course_id, body="", revision=0, updated_at=utc_now())
                session.add(item)
            item.body = payload.body.strip()
            item.revision += 1
            item.updated_at = utc_now()
            path = folder / f"{course_id}_{safe_name(course.name, 80)}.v{item.revision:04d}.md"
            write_once(path, (item.body + "\n" if item.body else "").encode("utf-8"))
            session.commit()
        return course_material(course_id)

    @router.get("/files/{version_id}/inline")
    def inline_material(version_id: int):
        with factory() as session:
            _, _, path = require_version(session, version_id)
            return FileResponse(path, media_type="application/pdf", content_disposition_type="inline",
                                headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                                         "Content-Disposition": "inline"})

    @router.post("/api/material/{version_id}/annotations", response_model=MaterialAnnotationView)
    def add_annotation(version_id: int, payload: AnnotationInput):
        coordinator.assert_writer()
        with factory() as session:
            version, _, _ = require_version(session, version_id)
            try:
                item = create(session, settings.data_dir, version, payload.kind, payload.quote,
                              payload.page, payload.comment, payload.rects,
                              annotation_id=str(payload.id) if payload.id is not None else None)
                return display(session, settings.data_dir, version, item)
            except MaterialError as exc:
                status = 409 if any(word in str(exc) for word in ("bereits", "migrieren", "Index")) else 400
                raise HTTPException(status, str(exc)) from None
            except Exception as exc:  # noqa: BLE001 - do not log selected private text
                log.warning("Markierung konnte nicht gespeichert werden: %s", type(exc).__name__)
                raise HTTPException(503, "Markierung konnte nicht gespeichert werden") from None

    @router.patch("/api/material/annotations/{annotation_id}", response_model=MaterialAnnotationView)
    def edit_annotation(annotation_id: str, payload: AnnotationUpdate):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(MaterialAnnotation, annotation_id)
            if item is None:
                raise HTTPException(404, "Markierung nicht gefunden")
            version = session.get(ResourceVersion, item.source_version_id)
            if version is None:
                raise HTTPException(404, "Material nicht gefunden")
            try:
                update(session, settings.data_dir, item, comment=payload.comment,
                       resolved=payload.resolved, expected_revision=payload.expected_revision)
                return display(session, settings.data_dir, version, item)
            except MaterialError as exc:
                status = 409 if any(word in str(exc) for word in ("inzwischen", "migrieren", "Index")) else 400
                raise HTTPException(status, str(exc)) from None
            except Exception as exc:  # noqa: BLE001 - do not log private comments
                log.warning("Markierung konnte nicht aktualisiert werden: %s", type(exc).__name__)
                raise HTTPException(503, "Markierung konnte nicht aktualisiert werden") from None

    @router.delete("/api/material/annotations/{annotation_id}", status_code=204)
    def remove_annotation(annotation_id: str, expected_revision: int = Query(ge=1)):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(MaterialAnnotation, annotation_id)
            if item is None:
                raise HTTPException(404, "Markierung nicht gefunden")
            try:
                delete_annotation(session, settings.data_dir, item, expected_revision)
            except MaterialError as exc:
                raise HTTPException(409, str(exc)) from None
            except Exception as exc:  # noqa: BLE001 - do not log private comments
                log.warning("Markierung konnte nicht entfernt werden: %s", type(exc).__name__)
                raise HTTPException(503, "Markierung konnte nicht entfernt werden") from None

    @router.post("/api/material/{version_id}/annotations/{annotation_id}/reanchor",
                 response_model=MaterialAnnotationView)
    def reanchor_annotation(version_id: int, annotation_id: str, payload: AnnotationReanchor):
        coordinator.assert_writer()
        with factory() as session:
            version, _, _ = require_version(session, version_id)
            item = session.get(MaterialAnnotation, annotation_id)
            if item is None:
                raise HTTPException(404, "Markierung nicht gefunden")
            try:
                reanchor(session, settings.data_dir, item, version, quote=payload.quote,
                         page=payload.page, rects=payload.rects,
                         expected_revision=payload.expected_revision)
                return display(session, settings.data_dir, version, item)
            except MaterialError as exc:
                status = 409 if any(word in str(exc) for word in ("inzwischen", "migrieren", "Index")) else 400
                raise HTTPException(status, str(exc)) from None
            except Exception as exc:  # noqa: BLE001 - do not log selected private text
                log.warning("Markierung konnte nicht zugeordnet werden: %s", type(exc).__name__)
                raise HTTPException(503, "Markierung konnte nicht zugeordnet werden") from None

    @router.get("/api/material/{version_id}/export")
    def export_annotations(version_id: int):
        with factory() as session:
            version, _, path = require_version(session, version_id)
            try:
                annotations = annotations_for(session, settings.data_dir, version)
            except MaterialError as exc:
                raise HTTPException(409, str(exc)) from None
        with pymupdf.open(path) as pdf:
            for item in annotations:
                found = item["anchor"]
                if found["status"] != "matched":
                    continue
                page = pdf[found["page"] - 1]
                for coords in found["rects"]:
                    rect = pymupdf.Rect(coords[0] * page.rect.width, coords[1] * page.rect.height,
                                        coords[2] * page.rect.width, coords[3] * page.rect.height)
                    mark = page.add_highlight_annot(rect)
                    mark.set_colors(stroke=(1, 0.55, 0.2) if item["kind"] == "question" else (1, 0.85, 0.2))
                    mark.update()
                if item["comment"]:
                    first = found["rects"][0]
                    page.add_text_annot((first[2] * page.rect.width, first[1] * page.rect.height), item["comment"])
            output = pdf.tobytes(garbage=4, deflate=True)
        return Response(output, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="material-{version_id}-markiert.pdf"',
                                 "Cache-Control": "private, no-store"})

    return router
