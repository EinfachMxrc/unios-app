# SPDX-License-Identifier: AGPL-3.0-or-later

"""HTTP interface of the mycampus import: pick a study programme, import, list the results."""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.config import Settings
from app.db.models import CampusItem, Resource, ResourceVersion
from app.host.lease import HostCoordinator
from app.institutions import load_institution
from app.notify.service import Notifier
from app.portals.campus_import import (
    CampusImportError,
    CampusLoginRequired,
    ImportReport,
    PageReader,
    list_programs,
    load_program_choice,
    run_import,
    save_program_choice,
)
from app.portals.campus_job_service import CampusImportJob, ImportStatus
from app.portals.read_client import (
    PortalLoginRequired,
    PortalReadClient,
    PortalReadError,
)
from app.portals.session import load_session, valid_portal_url
from app.sync.engine import SyncEngine

log = logging.getLogger(__name__)
ItemKind = Literal["event", "news", "document", "page"]


class ProgramView(BaseModel):
    name: str
    url: str
    faculty: str
    degree: str


class ProgramChoice(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    url: str = Field(min_length=10, max_length=2000)


class ItemView(BaseModel):
    id: int
    kind: str
    title: str
    summary: str
    url: str
    category: str
    published_at: datetime | None
    starts_at: datetime | None
    file_label: str | None
    study_program: str | None
    material_id: int | None = None  # the stored copy of a document, ready to open in the reader


def campus_base_url(settings: Settings) -> str | None:
    profile = load_institution(settings.institution_slug)
    return str(profile.mycampus.base_url) if profile.mycampus.base_url else None


@contextmanager
def open_portal_reader(base_url: str) -> Iterator[PageReader | None]:
    """A GET-only reader with the saved sign-in, or ``None`` when nobody signed in yet."""
    session = load_session("mycampus", base_url)
    if session is None:
        yield None
        return
    try:
        with PortalReadClient(base_url, session) as reader:
            yield reader
    except PortalLoginRequired as exc:
        raise CampusLoginRequired("Die myCampus-Anmeldung ist abgelaufen. Bitte erneut anmelden.") from exc
    except PortalReadError as exc:
        raise CampusImportError("Die gespeicherte Anmeldung passt nicht zu myCampus.") from exc


def campus_import_router(settings: Settings, factory, coordinator: HostCoordinator,
                         job: CampusImportJob | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/mycampus", tags=["mycampus"])
    lock = threading.Lock()
    job = job or CampusImportJob()

    def base_url() -> str:
        url = campus_base_url(settings)
        if url is None:
            raise HTTPException(409, "Für diese Hochschule ist myCampus nicht eingerichtet")
        return url

    @router.get("/programs", response_model=list[ProgramView])
    def programs():
        url = base_url()
        try:
            with open_portal_reader(url) as reader:
                if reader is None:
                    raise HTTPException(409, "Zuerst bei myCampus anmelden")
                found = list_programs(reader, url)
        except PortalLoginRequired as exc:
            raise HTTPException(409, "Die myCampus-Anmeldung ist abgelaufen. Bitte erneut anmelden.") from exc
        except CampusImportError as exc:
            raise HTTPException(409, str(exc)) from exc
        return [ProgramView(**asdict(item)) for item in found]

    @router.get("/program")
    def chosen_program():
        return load_program_choice(settings.local_dir)

    @router.post("/program")
    def choose_program(payload: ProgramChoice):
        coordinator.assert_writer()
        if not valid_portal_url(payload.url, base_url()):
            raise HTTPException(400, "Adresse gehört nicht zu myCampus")
        save_program_choice(settings.local_dir, payload.name, payload.url)
        return {"name": payload.name, "url": payload.url}

    def work(url: str) -> None:
        try:
            with open_portal_reader(url) as reader:
                if reader is None:
                    raise CampusLoginRequired("Zuerst bei myCampus anmelden")
                engine = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator)
                report: ImportReport = run_import(factory, reader, url, settings.timezone, settings.local_dir,
                                                  engine=engine)
            job.complete(asdict(report))
        except CampusImportError as exc:
            job.fail(str(exc), login_required=isinstance(exc, CampusLoginRequired))
        except Exception:
            log.exception("myCampus-Import fehlgeschlagen")
            job.fail("Der Import ist fehlgeschlagen.")
        finally:
            lock.release()

    @router.post("/import", status_code=202)
    def start_import():
        coordinator.assert_writer()
        url = base_url()
        with open_portal_reader(url) as reader:
            if reader is None:
                raise HTTPException(409, "Zuerst bei myCampus anmelden")
        if not lock.acquire(blocking=False):
            raise HTTPException(409, "Ein Import läuft bereits")
        job.begin()
        threading.Thread(target=work, args=(url,), daemon=True).start()
        return {"state": "running"}

    @router.get("/import/status", response_model=ImportStatus)
    def import_status():
        return job.snapshot()

    @router.get("/items", response_model=list[ItemView])
    def items(kind: ItemKind | None = None, limit: int = Query(300, ge=1, le=1000)):
        with factory() as session:
            query = select(CampusItem)
            if kind is not None:
                query = query.where(CampusItem.kind == kind)
            rows = session.scalars(query).all()
            latest = dict(session.execute(
                select(Resource.source_key, func.max(ResourceVersion.id))
                .join(ResourceVersion, ResourceVersion.resource_id == Resource.id)
                .where(Resource.source == "mycampus").group_by(Resource.source_key)).all())
        def moment(row: CampusItem) -> datetime | None:
            return row.starts_at or row.published_at
        dated = sorted((row for row in rows if moment(row) is not None), key=lambda row: moment(row).timestamp())  # type: ignore[union-attr]
        if kind in {"news", "document"}:
            dated.reverse()
        ordered = dated + [row for row in rows if moment(row) is None]
        return [ItemView(id=row.id, kind=row.kind, title=row.title, summary=row.summary, url=row.url,
                         category=row.category, published_at=row.published_at, starts_at=row.starts_at,
                         file_label=row.file_label, study_program=row.study_program,
                         material_id=latest.get(row.source_key) if row.kind in {"document", "page"} else None)
                for row in ordered[:limit]]

    return router
