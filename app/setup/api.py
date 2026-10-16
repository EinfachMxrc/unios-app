# SPDX-License-Identifier: AGPL-3.0-or-later

"""Short first-run setup for an installer-created local device."""

import json
import os
import re
import secrets
from collections.abc import Callable
from pathlib import Path
from typing import Literal
from urllib.parse import quote, urlsplit

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.config import Settings
from app.connectors.manifest import registered_profiles
from app.connectors.moodle.client import MoodleClient
from app.db.models import SyncRun
from app.host.lease import HostCoordinator
from app.institutions import (
    chosen_institution,
    load_institution,
    save_institution_choice,
)
from app.portals.campus_import import load_program_choice
from app.portals.sample import PortalSampleError
from app.portals.sample_export import (
    MAX_SAMPLE_PAGES,
    PAGE_KINDS,
    default_sample_directory,
    new_sample_path,
    write_sample_archive,
)
from app.portals.session import (
    PORTALS,
    PortalSessionError,
    keyring_available,
    load_session,
    save_session,
    valid_portal_url,
    validate_session,
)
from app.secrets import clear_ntfy_url, save_moodle_token, save_ntfy_url
from app.setup.connection_health_repository import ConnectionHealthRepository
from app.setup.connection_health_service import ConnectionHealthService
from app.setup.moodle_login_repository import MoodleLoginRepository
from app.setup.moodle_login_service import MoodleLoginExpired, MoodleLoginService
from app.web.contracts import MoodleLoginView, PortalSampleView, SetupStatusView


class InstitutionChoice(BaseModel):
    slug: str


class StudyProgramChoice(BaseModel):
    name: str = Field(min_length=2, max_length=300)


class MoodleConnection(BaseModel):
    token: str = Field(min_length=10, max_length=2048)


class MoodleCallback(BaseModel):
    callback: str = Field(min_length=10, max_length=4096)


class PortalCookie(BaseModel):
    """One cookie of the app's own sign-in window, shaped like a Playwright storage state."""

    name: str = Field(min_length=1, max_length=256)
    value: str = Field(max_length=4096)
    domain: str = Field(min_length=1, max_length=253)
    path: str = Field(default="/", max_length=1024)
    expires: float = -1
    httpOnly: bool = False
    secure: bool = False
    sameSite: Literal["Strict", "Lax", "None"] = "Lax"


class PortalCapture(BaseModel):
    entry_url: str = Field(min_length=10, max_length=4096)
    cookies: list[PortalCookie] = Field(max_length=300)


class SamplePage(BaseModel):
    kind: str = Field(min_length=1, max_length=32)
    html: str = Field(min_length=1, max_length=3_500_000)


class SampleRequest(BaseModel):
    pages: list[SamplePage] = Field(min_length=1, max_length=MAX_SAMPLE_PAGES)


class NotificationChoice(BaseModel):
    enabled: bool
    url: str = ""


def _read_marker(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "Einrichtungsstand ist unlesbar") from exc
    if not isinstance(value, dict) or value.get("version") != 1:
        raise HTTPException(503, "Einrichtungsstand ist ungültig")
    return value


def _write_marker(path: Path, value: dict) -> None:
    temporary = path.with_name(path.name + "." + secrets.token_hex(8) + ".tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _valid_ntfy_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return False
    topic = parsed.path.removeprefix("/")
    return bool(parsed.scheme == "https" and parsed.hostname == "ntfy.sh"
                and port in {None, 443} and not parsed.username and not parsed.password
                and not parsed.query and not parsed.fragment
                and re.fullmatch(r"[A-Za-z0-9]{24,128}", topic))


def setup_router(settings: Settings, sync_engine, coordinator: HostCoordinator,
                 on_campus_login: Callable[[], None] | None = None,
                 on_sources_ready: Callable[[], None] | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/setup", tags=["setup"])
    marker = settings.local_dir / "setup.json"
    profile = load_institution(settings.institution_slug)
    moodle_available = profile.moodle_url is not None
    moodle_login = MoodleLoginService(MoodleLoginRepository(settings.local_dir))
    connection_health = ConnectionHealthService(ConnectionHealthRepository(sync_engine.factory))

    def required_state() -> dict:
        state = _read_marker(marker)
        if state is None:
            raise HTTPException(404, "Einrichtungsassistent wurde nicht gestartet")
        return state

    def portal_status() -> list[dict]:
        items = []
        for name in sorted(PORTALS):
            config = getattr(profile, name)
            if config.base_url is None:
                continue
            base_url = str(config.base_url)
            items.append({"portal": name, "connected": load_session(name, base_url) is not None,
                          "login_url": str(config.login_start_url or base_url)})
        return items

    def status() -> dict:
        state = _read_marker(marker)
        study_program = None
        if profile.mycampus.base_url:
            saved_program = load_program_choice(settings.local_dir)
            if saved_program and valid_portal_url(saved_program["url"], str(profile.mycampus.base_url)):
                study_program = saved_program["name"]
        elif state and state.get("institution") == settings.institution_slug:
            study_program = state.get("study_program")
        try:
            with sync_engine.factory() as session:
                latest = session.scalar(select(SyncRun).order_by(SyncRun.id.desc()).limit(1))
                initial_sync = ({"status": latest.status, "course_count": latest.course_count,
                                 "resource_count": latest.resource_count, "change_count": latest.change_count}
                                if latest else None)
        except OperationalError:
            # The first-run screen is also used before an empty fixture is migrated.
            initial_sync = None
        return {
            "installed": state is not None,
            "completed": bool(state.get("completed")) if state else True,
            "institution": settings.institution_slug,
            "institution_name": profile.name,
            "profiles": registered_profiles(),
            "pending_institution": chosen_institution(settings.local_dir),
            "institution_confirmed": state.get("institution") == settings.institution_slug if state else True,
            "moodle_available": moodle_available,
            "moodle_connected": bool(settings.moodle_enabled and settings.moodle_token),
            "notifications": state.get("notifications") if state else None,
            "initial_sync": initial_sync,
            "portals": portal_status(),
            "study_program": study_program,
            "study_program_confirmed": bool(study_program),
        }

    @router.get("/status", response_model=SetupStatusView, response_model_exclude_unset=True)
    def get_status():
        return status()

    @router.post("/program", response_model=SetupStatusView, response_model_exclude_unset=True)
    def choose_study_program(payload: StudyProgramChoice):
        coordinator.assert_writer()
        state = required_state()
        if state.get("institution") != settings.institution_slug:
            raise HTTPException(409, "Zuerst die Hochschule bestätigen")
        if profile.mycampus.base_url:
            raise HTTPException(409, "Bitte einen Studiengang aus dem Hochschulkatalog auswählen")
        name = payload.name.strip()
        if len(name) < 2:
            raise HTTPException(422, "Bitte den Studiengang mit Abschluss angeben")
        state["study_program"] = name
        _write_marker(marker, state)
        return status()

    @router.post("/institution", response_model=SetupStatusView, response_model_exclude_unset=True)
    def choose_institution(payload: InstitutionChoice):
        nonlocal profile, moodle_available
        coordinator.assert_writer()
        state = required_state()
        if payload.slug != settings.institution_slug:
            try:
                selected = load_institution(payload.slug)
                save_institution_choice(settings.local_dir, payload.slug)
            except (OSError, ValueError) as exc:
                raise HTTPException(400, "Dieses Hochschulprofil ist nicht veröffentlicht") from exc
            if not state.get("completed"):
                settings.institution_slug = payload.slug
                settings.moodle_base_url = str(selected.moodle_url).rstrip("/") if selected.moodle_url else ""
                settings.moodle_token = ""
                sync_engine.connectors[:] = [item for item in sync_engine.connectors if item.name != "moodle"]
                profile = selected
                moodle_available = selected.moodle_url is not None
                state.pop("study_program", None)
                state["institution"] = payload.slug
                _write_marker(marker, state)
                return status()
            state["institution"] = None
            state.pop("study_program", None)
            _write_marker(marker, state)
            return {**status(), "restart_required": True}
        try:
            load_institution(payload.slug)
        except (OSError, ValueError) as exc:
            raise HTTPException(400, "Hochschulprofil fehlt") from exc
        state["institution"] = payload.slug
        _write_marker(marker, state)
        return status()

    @router.post("/portals/{portal}/session", response_model=SetupStatusView, response_model_exclude_unset=True)
    def save_portal_login(portal: str, payload: PortalCapture):
        """Keep the sign-in the user did in the app's login window; the password never reaches UniOS."""
        coordinator.assert_writer()
        required_state()
        if portal not in PORTALS:
            raise HTTPException(404, "Unbekanntes Portal")
        config = getattr(profile, portal)
        if config.base_url is None:
            raise HTTPException(400, "Portal-Adresse fehlt im Hochschulprofil")
        if not keyring_available():
            raise HTTPException(503, "Sicherer System-Schlüsselbund ist nicht verfügbar")
        state = {"cookies": [cookie.model_dump() for cookie in payload.cookies], "origins": []}
        try:
            session = validate_session(portal, str(config.base_url), payload.entry_url, state,
                                       tuple(config.auth_cookie_hosts))
            save_session(str(config.base_url), session)
            if portal == "mycampus" and on_campus_login is not None:
                on_campus_login()
        except PortalSessionError as exc:
            raise HTTPException(400, str(exc)) from exc
        if portal == "primuss" and profile.mycampus.base_url is not None:
            # PRIMUSS is reached through myCampus; its first-party cookie can be reused when present.
            try:
                campus = str(profile.mycampus.base_url)
                save_session(campus, validate_session("mycampus", campus, campus + "/", state,
                                                      tuple(profile.mycampus.auth_cookie_hosts)))
                if on_campus_login is not None:
                    on_campus_login()
            except PortalSessionError:
                pass
        return status()

    @router.post("/portals/{portal}/samples", response_model=PortalSampleView, response_model_exclude_unset=True)
    def save_portal_samples(portal: str, payload: SampleRequest):
        """Turn pages the user opened in the portal window into an anonymised, reviewable ZIP."""
        coordinator.assert_writer()
        required_state()
        if portal not in PORTALS:
            raise HTTPException(404, "Unbekanntes Portal")
        if any(page.kind not in PAGE_KINDS for page in payload.pages):
            raise HTTPException(422, "Seitenart ist ungültig")
        if not keyring_available():
            raise HTTPException(503, "Sicherer System-Schlüsselbund ist nicht verfügbar")
        target = new_sample_path(portal, default_sample_directory())
        try:
            write_sample_archive(portal, [page.html for page in payload.pages], target,
                                 [page.kind for page in payload.pages])
        except PortalSampleError as exc:
            raise HTTPException(400, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(500, "Beispieldatei konnte nicht geschrieben werden") from exc
        return {"file": target.name, "folder": target.parent.name, "pages": len(payload.pages)}

    @router.post("/moodle/start", response_model=MoodleLoginView, response_model_exclude_unset=True)
    def start_moodle_login():
        coordinator.assert_writer()
        state = required_state()
        if state.get("institution") != settings.institution_slug:
            raise HTTPException(409, "Zuerst die Hochschule bestätigen")
        profile = load_institution(settings.institution_slug)
        if profile.moodle_url is None:
            raise HTTPException(400, "Moodle-Adresse fehlt")
        passport = secrets.token_urlsafe(24)
        base_url = str(profile.moodle_url).rstrip("/")
        try:
            moodle_login.start(base_url, settings.institution_slug, passport)
        except (OSError, ValueError) as exc:
            raise HTTPException(503, "Moodle-Anmeldung konnte nicht vorbereitet werden") from exc
        return {"login_url": base_url + "/admin/tool/mobile/launch.php?service=moodle_mobile_app"
                + "&passport=" + quote(passport) + "&urlscheme=marcunios"}

    @router.post("/moodle/callback", response_model=SetupStatusView, response_model_exclude_unset=True)
    def finish_moodle_login(payload: MoodleCallback):
        coordinator.assert_writer()
        required_state()
        profile = load_institution(settings.institution_slug)
        if profile.moodle_url is None:
            raise HTTPException(400, "Moodle-Adresse fehlt")
        try:
            return moodle_login.finish(payload.callback, str(profile.moodle_url).rstrip("/"),
                                       settings.institution_slug, lambda: settings.moodle_token,
                                       lambda token: connect_moodle(MoodleConnection(token=token)), status)
        except MoodleLoginExpired as exc:
            raise HTTPException(409, "Moodle-Anmeldung erneut starten") from exc
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(400, "Moodle-Weiterleitung konnte nicht gelesen werden") from exc
        except OSError as exc:
            raise HTTPException(503, "Moodle-Anmeldevorgang konnte nicht gespeichert werden") from exc

    @router.post("/moodle", response_model=SetupStatusView, response_model_exclude_unset=True)
    def connect_moodle(payload: MoodleConnection):
        coordinator.assert_writer()
        state = required_state()
        if state.get("institution") != settings.institution_slug:
            raise HTTPException(409, "Zuerst die Hochschule bestätigen")
        profile = load_institution(settings.institution_slug)
        if profile.moodle_url is None:
            raise HTTPException(400, "Moodle-Adresse fehlt")
        base_url = str(profile.moodle_url).rstrip("/")
        candidate = settings.model_copy(update={"moodle_base_url": base_url, "moodle_token": payload.token})
        try:
            site = MoodleClient(candidate).call("core_webservice_get_site_info")
            if not isinstance(site, dict) or "userid" not in site:
                raise ValueError("Site-Info fehlt")
        except Exception as exc:  # Never expose credential-bearing Moodle errors.
            raise HTTPException(400, "Moodle-Token konnte nicht geprüft werden") from exc
        if not save_moodle_token(base_url, payload.token):
            raise HTTPException(503, "Sicherer System-Schlüsselbund ist nicht verfügbar")
        settings.moodle_base_url = base_url
        settings.moodle_token = payload.token
        if not any(connector.name == "moodle" for connector in sync_engine.connectors):
            sync_engine.connectors.append(MoodleClient(settings))
        connection_health.moodle_token_verified()
        if on_sources_ready is not None:
            on_sources_ready()
        return status()

    @router.post("/notifications", response_model=SetupStatusView, response_model_exclude_unset=True)
    def choose_notifications(payload: NotificationChoice):
        coordinator.assert_writer()
        state = required_state()
        if payload.enabled:
            if not _valid_ntfy_url(payload.url):
                raise HTTPException(400, "Bitte eine private ntfy.sh-Adresse mit langem Topic verwenden")
            try:
                with httpx.Client(timeout=10, trust_env=False) as client:
                    response = client.post(payload.url, content=b"UniOS: Testhinweis",
                                           headers={"Title": "Testhinweis"})
                    response.raise_for_status()
            except httpx.HTTPError as exc:
                raise HTTPException(503, "Testhinweis konnte nicht zugestellt werden") from exc
            if not save_ntfy_url(payload.url):
                raise HTTPException(503, "Sicherer System-Schlüsselbund ist nicht verfügbar")
            settings.ntfy_url = payload.url
            state["notifications"] = "tested"
        else:
            if settings.ntfy_url and not clear_ntfy_url():
                raise HTTPException(503, "Handy-Hinweise konnten nicht ausgeschaltet werden")
            settings.ntfy_url = ""
            state["notifications"] = "off"
        _write_marker(marker, state)
        return status()

    @router.post("/complete", response_model=SetupStatusView, response_model_exclude_unset=True)
    def complete_setup():
        coordinator.assert_writer()
        state = required_state()
        if (state.get("institution") != settings.institution_slug or (moodle_available and not settings.moodle_token)
                or state.get("notifications") not in {"tested", "off"}):
            raise HTTPException(409, "Hochschule, Moodle und Hinweise zuerst einrichten")
        if not status()["study_program_confirmed"]:
            raise HTTPException(409, "Zuerst den Studiengang auswählen")
        state["completed"] = True
        _write_marker(marker, state)
        if on_sources_ready is not None:
            on_sources_ready()
        return status()

    return router
