# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only PRIMUSS preview driven by a reviewed institution profile."""

from __future__ import annotations

import re
from datetime import datetime
from hashlib import sha256

from bs4 import BeautifulSoup
from bs4.element import Tag
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from soupsieve.util import SelectorSyntaxError
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings
from app.host.lease import HostCoordinator
from app.institutions import load_institution
from app.portals.primuss_enrollment import (
    enrollment_configured,
    latest_enrollment_rows,
    parse_enrollment_rows,
    store_enrollment_rows,
)
from app.portals.primuss_grades import (
    grade_configured,
    parse_grade_rows,
    store_grade_rows,
)
from app.portals.primuss_store import (
    PrimussStoreError,
    saved_exam_rows,
    store_verified_exams,
)
from app.portals.proof import (
    PortalProofError,
    capture_portal_proof,
    proof_path,
    save_portal_proof,
)
from app.portals.read_client import (
    PortalLoginRequired,
    PortalReadClient,
    PortalReadError,
)
from app.portals.sample import PortalSampleError, load_alias_map, resolve_selectors
from app.portals.session import load_session, valid_portal_url

REQUIRED = (
    "exams_link", "exams", "exam_title", "registration_status",
    "grades_link", "grades", "grade_title", "grade_value",
)
MAX_ROWS = 200


class PrimussRenderedPage(BaseModel):
    url: str = Field(max_length=8000)
    html: str = Field(max_length=2_000_000)
    label: str = Field(min_length=1, max_length=200)


class PrimussImportRequest(BaseModel):
    pages: list[PrimussRenderedPage] = Field(default_factory=list, max_length=60)
    partial: bool = False


class ExamPreview(BaseModel):
    source_key: str | None = None
    title: str
    exam_at: datetime | None
    registration: str
    registration_text: str | None
    registration_deadline: datetime | None


class GradePreview(BaseModel):
    title: str
    value: str | None
    ects: str | None
    status: str | None


class PrimussPreview(BaseModel):
    exams: list[ExamPreview]
    grades: list[GradePreview]
    warnings: list[str]
    proof_id: str | None = None
    proof_at: datetime | None = None
    saved: bool = False


class PrimussStatus(BaseModel):
    configured: bool
    session_available: bool
    missing_fields: list[str]
    alias_map_available: bool
    sync_available: bool
    grades_sync_available: bool
    enrollment_available: bool


class GradeSyncReport(BaseModel):
    created: int
    updated: int
    unchanged: int
    skipped: int
    warnings: list[str]


class EnrollmentView(BaseModel):
    title: str
    status: str
    deadline_at: datetime | None
    checked_at: datetime


class EnrollmentReport(BaseModel):
    rows: list[EnrollmentView]
    warnings: list[str]


class SavedExam(BaseModel):
    id: int
    title: str
    exam_at: datetime | None
    registration: str
    checked_at: datetime
    proof_id: str | None


def valid_exam_key_attr(value: str | None) -> bool:
    return bool(value == "id" or (value and re.fullmatch(r"data-[a-z0-9-]{1,50}", value)))


def _select(root: BeautifulSoup | Tag, selector: str | None) -> Tag | None:
    if not selector:
        return None
    return root.select_one(selector)


def _text(root: BeautifulSoup | Tag, selector: str | None) -> str | None:
    element = _select(root, selector)
    if element is None:
        return None
    value = " ".join(element.stripped_strings).strip()[:300]
    return value or None


def _date(root: Tag, selector: str | None) -> datetime | None:
    element = _select(root, selector)
    if element is None:
        return None
    value = element.get("datetime")
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _rows(html: str, selector: str, name: str) -> tuple[BeautifulSoup, list[Tag], list[str]]:
    soup = BeautifulSoup(html, "html.parser")
    found = soup.select(selector)
    if not found:
        return soup, [], [f"{name}: Keine passenden Einträge; Seitenstruktur oder Anmeldung prüfen."]
    if len(found) > MAX_ROWS:
        return soup, [], [f"{name}: Zu viele Einträge; Selektor prüfen."]
    return soup, [row for row in found if isinstance(row, Tag)], []


def parse_preview(exams_html: str, grades_html: str,
                  selectors: dict[str, str | None]) -> PrimussPreview:
    """Parse only explicit fields; uncertain dates/statuses remain unknown."""
    if any(not selectors.get(key) for key in REQUIRED):
        raise ValueError("PRIMUSS-Selektoren sind unvollständig")
    key_attr = selectors.get("exam_key_attr")
    if key_attr and not valid_exam_key_attr(key_attr):
        raise ValueError("PRIMUSS-Prüfungsschlüssel ist nicht erlaubt")
    try:
        _, exam_rows, warnings = _rows(exams_html, selectors["exams"] or "", "Prüfungen")
        _, grade_rows, grade_warnings = _rows(grades_html, selectors["grades"] or "", "Noten")
        warnings.extend(grade_warnings)
        exams: list[ExamPreview] = []
        grades: list[GradePreview] = []
        for row in exam_rows:
            title = _text(row, selectors["exam_title"])
            if not title:
                warnings.append("Prüfung ohne eindeutigen Titel ausgelassen.")
                continue
            raw = _text(row, selectors["registration_status"])
            identity = row.get(key_attr) if key_attr else None
            source_key = None
            if (isinstance(identity, str) and 1 <= len(identity.strip()) <= 200
                    and not re.search(r"(?i)(?:session|user|token)=", identity)):
                source_key = "primuss:" + sha256(identity.strip().encode("utf-8")).hexdigest()
            normalized = raw.casefold() if raw else ""
            confirmed = (selectors.get("registered_text") or "").casefold()
            unregistered = (selectors.get("unregistered_text") or "").casefold()
            registration = "unclear"
            if confirmed and unregistered and confirmed != unregistered and normalized == confirmed:
                registration = "registered"
            elif confirmed and unregistered and confirmed != unregistered and normalized == unregistered:
                registration = "unregistered"
            exam_at = _date(row, selectors.get("exam_date"))
            deadline = _date(row, selectors.get("registration_deadline"))
            if selectors.get("exam_date") and exam_at is None:
                warnings.append(f"Prüfung „{title}“: Termin unklar.")
            if selectors.get("registration_deadline") and deadline is None:
                warnings.append(f"Prüfung „{title}“: Anmeldefrist unklar.")
            exams.append(ExamPreview(source_key=source_key, title=title, exam_at=exam_at,
                                     registration=registration, registration_text=raw,
                                     registration_deadline=deadline))
        for row in grade_rows:
            title = _text(row, selectors["grade_title"])
            if not title:
                warnings.append("Notenzeile ohne eindeutigen Titel ausgelassen.")
                continue
            grades.append(GradePreview(title=title, value=_text(row, selectors["grade_value"]),
                                       ects=_text(row, selectors.get("grade_ects")),
                                       status=_text(row, selectors.get("grade_status"))))
        return PrimussPreview(exams=exams, grades=grades, warnings=warnings)
    except SelectorSyntaxError as exc:
        raise ValueError("PRIMUSS-Selektor ist ungültig") from exc


def _linked_page(entry_html: str, selector: str, reader: PortalReadClient,
                 base_url: str) -> tuple[str, str]:
    try:
        link = _select(BeautifulSoup(entry_html, "html.parser"), selector)
    except SelectorSyntaxError as exc:
        raise ValueError("PRIMUSS-Linkselektor ist ungültig") from exc
    href = link.get("href") if link else None
    if not isinstance(href, str) or not href.strip():
        raise ValueError("PRIMUSS-Link wurde nicht gefunden; Anmeldung oder Profil prüfen")
    # The read client checks the resolved URL again before requesting it.
    from urllib.parse import urljoin

    if not valid_portal_url(urljoin(reader.entry_url, href), base_url):
        raise ValueError("PRIMUSS-Link verlässt die erlaubte Adresse")
    return reader.get_page(href)


def primuss_router(settings: Settings, factory, coordinator: HostCoordinator, sync_engine=None) -> APIRouter:
    router = APIRouter(prefix="/api/primuss", tags=["primuss"])

    def configuration() -> tuple[str, dict[str, str | None], str | None]:
        try:
            profile = load_institution(settings.institution_slug).primuss
        except (OSError, ValueError) as exc:
            raise HTTPException(503, "Hochschulprofil nicht verfügbar") from exc
        if profile.base_url is None:
            raise HTTPException(503, "PRIMUSS-Adresse nicht konfiguriert")
        return str(profile.base_url), profile.selectors, profile.selector_alias_map

    def configured_selectors(selectors: dict[str, str | None],
                             map_id: str | None) -> dict[str, str | None] | None:
        if any(not selectors.get(key) for key in REQUIRED):
            return None
        if map_id is None:
            return selectors
        aliases = load_alias_map("primuss", map_id)
        if aliases is None:
            return None
        try:
            return resolve_selectors(selectors, aliases)
        except PortalSampleError:
            return None

    @router.post("/import")
    def import_pages(payload: PrimussImportRequest | None = None):
        from dataclasses import asdict

        from app.connectors.base import RemoteCourse
        from app.portals.primuss_import import (
            PortalFiles,
            RenderedPage,
            collect_primuss,
        )

        coordinator.assert_writer()
        base_url, _, _ = configuration()
        stored = load_session("primuss", base_url)
        if stored is None:
            raise HTTPException(409, "Bitte zuerst bei PRIMUSS anmelden.")
        if sync_engine is None:
            raise HTTPException(503, "Dokumentenimport nicht verfügbar")
        if payload and (sum(len(page.html.encode()) for page in payload.pages) > 12_000_000
                        or any(not valid_portal_url(page.url, base_url) for page in payload.pages)):
            raise HTTPException(422, "Die erfassten Seiten passen nicht zum PRIMUSS-Portal oder sind zu groß.")
        try:
            with PortalReadClient(base_url, stored) as reader:
                rendered = [RenderedPage(page.url, page.html, page.label) for page in payload.pages] if payload else None
                report, resources, payloads = collect_primuss(reader, base_url, rendered=rendered,
                                                            partial=payload.partial if payload else False)
            if resources:
                report.files_stored, skipped = sync_engine.ingest_documents(PortalFiles(payloads), [
                    RemoteCourse(key="documents", name="PRIMUSS – Unterlagen", short_name="PRIMUSS", resources=resources)])
                report.skipped += skipped
            return asdict(report)
        except PortalLoginRequired as exc:
            raise HTTPException(409, "Die PRIMUSS-Anmeldung ist abgelaufen. Bitte erneut anmelden.") from exc
        except PortalReadError as exc:
            raise HTTPException(502, str(exc)) from exc

    def configured_grades(selectors: dict[str, str | None],
                          map_id: str | None) -> dict[str, str | None] | None:
        if not grade_configured(selectors):
            return None
        if map_id is None:
            return selectors
        aliases = load_alias_map("primuss", map_id)
        if aliases is None:
            return None
        try:
            return resolve_selectors(selectors, aliases)
        except PortalSampleError:
            return None

    def configured_enrollment(selectors: dict[str, str | None],
                              map_id: str | None) -> dict[str, str | None] | None:
        if not enrollment_configured(selectors):
            return None
        if map_id is None:
            return selectors
        aliases = load_alias_map("primuss", map_id)
        if aliases is None:
            return None
        try:
            return resolve_selectors(selectors, aliases)
        except PortalSampleError:
            return None

    @router.get("/status", response_model=PrimussStatus)
    def status():
        base_url, selectors, map_id = configuration()
        ready = configured_selectors(selectors, map_id) is not None
        return {"configured": ready, "session_available": load_session("primuss", base_url) is not None,
                "missing_fields": [key for key in REQUIRED if not selectors.get(key)],
                "alias_map_available": map_id is None or load_alias_map("primuss", map_id) is not None,
                "sync_available": ready and valid_exam_key_attr(selectors.get("exam_key_attr")),
                "grades_sync_available": configured_grades(selectors, map_id) is not None,
                "enrollment_available": configured_enrollment(selectors, map_id) is not None}

    def checked_preview(require_keys: bool = False) -> PrimussPreview:
        base_url, selectors, map_id = configuration()
        resolved = configured_selectors(selectors, map_id)
        if resolved is None:
            raise HTTPException(409, "PRIMUSS-Felder sind noch nicht mit einer anonymisierten Seite geprüft")
        stored = load_session("primuss", base_url)
        if stored is None:
            raise HTTPException(409, "PRIMUSS-Session fehlt; Anmeldung selbst am Host durchführen")
        try:
            with PortalReadClient(base_url, stored) as reader:
                entry = reader.get_html()
                exams_html, exams_url = _linked_page(entry, resolved["exams_link"] or "", reader, base_url)
                grades_html, _ = _linked_page(entry, resolved["grades_link"] or "", reader, base_url)
            result = parse_preview(exams_html, grades_html, resolved)
            if not result.exams:
                raise HTTPException(502, "Keine Prüfungen eindeutig erkannt; bitte Portalseite prüfen")
            if require_keys and (not valid_exam_key_attr(resolved.get("exam_key_attr"))
                                 or any(exam.source_key is None for exam in result.exams)
                                 or len({exam.source_key for exam in result.exams}) != len(result.exams)):
                raise HTTPException(409, "Prüfungen haben keine eindeutigen stabilen Schlüssel")
            image, proof_html = capture_portal_proof(base_url, exams_url, stored)
            proven = parse_preview(proof_html, grades_html, resolved)
            if proven.exams != result.exams:
                raise HTTPException(502, "Anmeldestatus und Nachweisbild stimmen nicht überein")
            result.proof_id, result.proof_at = save_portal_proof(settings.data_dir, image)
            return result
        except PortalLoginRequired as exc:
            raise HTTPException(409, str(exc)) from exc
        except (PortalReadError, PortalProofError, ValueError) as exc:
            raise HTTPException(502, str(exc)) from exc

    @router.post("/preview", response_model=PrimussPreview)
    def preview():
        return checked_preview()

    @router.post("/recheck", response_model=PrimussPreview)
    def recheck():
        coordinator.assert_writer()
        result = checked_preview(require_keys=True)
        try:
            with factory() as session:
                store_verified_exams(session, result)
                session.commit()
        except PrimussStoreError as exc:
            raise HTTPException(409, str(exc)) from exc
        except SQLAlchemyError as exc:
            raise HTTPException(503, "Prüfungsstatus konnte nicht gespeichert werden") from exc
        result.saved = True
        return result

    @router.post("/grades/sync", response_model=GradeSyncReport)
    def sync_grades():
        coordinator.assert_writer()
        base_url, selectors, map_id = configuration()
        resolved = configured_grades(selectors, map_id)
        if resolved is None:
            raise HTTPException(409, "PRIMUSS-Notenfelder sind noch nicht mit einer anonymisierten Seite geprüft")
        stored = load_session("primuss", base_url)
        if stored is None:
            raise HTTPException(409, "PRIMUSS-Session fehlt; Anmeldung selbst am Host durchführen")
        try:
            with PortalReadClient(base_url, stored) as reader:
                entry = reader.get_html()
                grades_html, _ = _linked_page(entry, resolved["grades_link"] or "", reader, base_url)
            rows, warnings = parse_grade_rows(grades_html, resolved)
        except PortalLoginRequired as exc:
            raise HTTPException(409, str(exc)) from exc
        except (PortalReadError, ValueError) as exc:
            raise HTTPException(502, str(exc)) from exc
        try:
            with factory() as session:
                created, updated, unchanged = store_grade_rows(session, rows)
                session.commit()
        except SQLAlchemyError as exc:
            raise HTTPException(503, "PRIMUSS-Noten konnten nicht gespeichert werden") from exc
        return GradeSyncReport(created=created, updated=updated, unchanged=unchanged,
                               skipped=len(warnings), warnings=warnings)

    @router.post("/enrollment/recheck", response_model=EnrollmentReport)
    def recheck_enrollment():
        coordinator.assert_writer()
        base_url, selectors, map_id = configuration()
        resolved = configured_enrollment(selectors, map_id)
        if resolved is None:
            raise HTTPException(409, "PRIMUSS-Rückmeldefelder sind noch nicht mit einer anonymisierten Seite geprüft")
        stored = load_session("primuss", base_url)
        if stored is None:
            raise HTTPException(409, "PRIMUSS-Session fehlt; Anmeldung selbst am Host durchführen")
        try:
            with PortalReadClient(base_url, stored) as reader:
                entry = reader.get_html()
                html, _ = _linked_page(entry, resolved["enrollment_link"] or "", reader, base_url)
            rows, warnings = parse_enrollment_rows(html, resolved)
        except PortalLoginRequired as exc:
            raise HTTPException(409, str(exc)) from exc
        except (PortalReadError, ValueError) as exc:
            raise HTTPException(502, str(exc)) from exc
        try:
            with factory() as session:
                store_enrollment_rows(session, rows)
                session.commit()
                saved = latest_enrollment_rows(session)
        except SQLAlchemyError as exc:
            raise HTTPException(503, "Rückmeldestatus konnte nicht gespeichert werden") from exc
        return EnrollmentReport(rows=[EnrollmentView(**item) for item in saved], warnings=warnings)

    @router.get("/enrollment", response_model=list[EnrollmentView])
    def enrollment():
        with factory() as session:
            return latest_enrollment_rows(session)

    @router.get("/exams", response_model=list[SavedExam])
    def saved_exams():
        with factory() as session:
            return saved_exam_rows(session)

    @router.get("/proofs/{proof_id}")
    def get_proof(proof_id: str):
        target = proof_path(settings.data_dir, proof_id)
        if target is None:
            raise HTTPException(404, "Nachweisbild nicht gefunden")
        return FileResponse(target, media_type="image/png", headers={"X-Content-Type-Options": "nosniff"})

    return router
