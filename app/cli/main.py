# SPDX-License-Identifier: AGPL-3.0-or-later

"""Machine-readable commands for local operation."""
import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal, NoReturn, cast

import typer
from alembic.config import Config
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from alembic import command
from app.ai.api import AiPackageRequest, build_ai_package
from app.ai.costs import estimate_costs
from app.ai.exercises import ExerciseImport
from app.ai.explanations import ExplanationImport
from app.anki.api import CardImport, enqueue_cards, list_card_queue
from app.cli.api_client import call_api
from app.cli.entities import (
    entity_cli,
    relate_command,
    unlink_command,
)
from app.config import RemoteAddressNotConfigured, Settings, get_settings
from app.connectors.manifest import registered_profiles, verified_registry
from app.connectors.moodle.client import MoodleClient
from app.connectors.permissions import ConnectorPermissions
from app.connectors.plugins import listed_connectors
from app.db.models import Change, ConnectorHealth, Course, Semester, SyncRun
from app.db.session import make_engine, make_session_factory
from app.deadline_proposals.service import upcoming_deadlines
from app.demo.service import create_demo, demo_settings
from app.entities.schema import EntityKind, catalog
from app.entities.schema import describe as describe_entity
from app.export.service import build_export
from app.extract.ocr_repository import OCRRepository
from app.extract.ocr_service import OCRError, OCRService
from app.extract.search import (
    search_annotations,
    search_announcements,
    search_course_notes,
    search_documents,
)
from app.files.sidecars import rebuild_index
from app.health.backup import main as backup_main
from app.health.doctor import doctor_report
from app.host.actions import ActionJournal
from app.host.handoff import acquire_released, acquire_stale, require_syncthing_ready
from app.host.lease import HostCoordinator, HostLeaseError
from app.host.snapshots import create_snapshot
from app.inbox.search import search_clips
from app.jots.store import search_jots
from app.material.events import rebuild_annotation_index
from app.material.migrate import migrate_legacy_annotations
from app.notes.store import search_notes
from app.notify.service import Notifier
from app.session_api import pairing_url
from app.sessions import PAIRING_CODE_TTL_SECONDS, SessionStore
from app.sync.engine import SyncEngine
from app.web.api import record

cli = typer.Typer(no_args_is_help=True, add_completion=False)
from app.cli.agent import agent_cli

cli.add_typer(agent_cli, name='agent')
host_cli = typer.Typer(no_args_is_help=True, add_completion=False)
anki_cli = typer.Typer(no_args_is_help=True, add_completion=False)
cards_cli = typer.Typer(no_args_is_help=True, add_completion=False)
ai_cli = typer.Typer(no_args_is_help=True, add_completion=False)
demo_cli = typer.Typer(no_args_is_help=True, add_completion=False)
connectors_cli = typer.Typer(no_args_is_help=True, add_completion=False)
connector_init_cli = typer.Typer(no_args_is_help=True, add_completion=False)
profiles_cli = typer.Typer(no_args_is_help=True, add_completion=False)
cli.add_typer(host_cli, name="host")
cli.add_typer(anki_cli, name="anki")
cli.add_typer(cards_cli, name="cards")
cli.add_typer(ai_cli, name="ai")
cli.add_typer(demo_cli, name="demo")
cli.add_typer(connectors_cli, name="connectors")
cli.add_typer(connector_init_cli, name="connector")
cli.add_typer(profiles_cli, name="profiles")
cli.add_typer(entity_cli, name="entity")
from app.cli.recovery import recovery_cli

cli.add_typer(recovery_cli, name="recovery")
cli.command("relate")(relate_command)
cli.command("unlink")(unlink_command)


def emit(value: object, pretty: bool = False) -> None:
    typer.echo(json.dumps(value, ensure_ascii=False, default=str, indent=2 if pretty else None))


def fail(message: str, code: int = 1) -> NoReturn:
    typer.echo(json.dumps({"error": message}, ensure_ascii=False), err=True)
    raise typer.Exit(code)


@contextmanager
def held_host(settings: Settings, refusal: str) -> Iterator[HostCoordinator]:
    """Hold the host lease for one offline command; without it the command ends with code 3."""
    coordinator = HostCoordinator(settings)
    if not coordinator.start():
        fail(refusal, 3)
    try:
        yield coordinator
    finally:
        coordinator.close()


@connector_init_cli.command('init')
def connector_init(directory: Path, connector_id: str = typer.Option(..., '--id'),
                   university: str = typer.Option(..., '--university'),
                   capability: Annotated[list[str] | None, typer.Option('--capability')] = None):
    """Neue Entwicklungsvorlage erstellen, ohne Registrierung oder Hochschulzugriff."""
    from app.connectors.scaffold import create_scaffold
    try:
        create_scaffold(directory, connector_id=connector_id, university=university,
                        capabilities=set(capability) if capability else None)
    except (ValueError, OSError):
        fail('Vorlage konnte nicht erstellt werden: neuen Ordner und gültige Lesefähigkeiten wählen')
    emit({'created': True, 'registered': False, 'directory': str(directory)})


@cli.callback()
def enforce_client_boundary(context: typer.Context) -> None:
    """Never let a migrated desktop command write its retained rollback DB."""
    # This separate group contains only an offline, unregistered scaffold generator.
    if context.invoked_subcommand == 'connector':
        return
    from app.client.service import client_enabled

    settings = get_settings()
    if client_enabled(settings.local_dir.resolve().parent) and context.invoked_subcommand not in {
        "api", "entity", "relate", "unlink", "schema", "describe", "profiles",
    }:
        fail("Dieses Gerät ist Server-Client. API-/Entity-Befehle verwenden; Verwaltungsbefehle auf dem Server ausführen.", 3)


def get_factory():
    settings = get_settings()
    return settings, make_session_factory(make_engine(settings, HostCoordinator(settings)))


@connectors_cli.command("list")
def connectors_list(pretty: bool = typer.Option(False, "--pretty")):
    """Show reviewed connector manifests and local permission decisions."""
    emit(listed_connectors(get_settings()), pretty)


@profiles_cli.command("list")
def profiles_list(pretty: bool = typer.Option(False, "--pretty")):
    """List published university profiles from the central registry."""
    emit(registered_profiles(), pretty)


@cli.command("api")
def api_command(method: str, path: str,
                port: int = typer.Option(8000, "--port"),
                body_file: Path | None = typer.Option(None, "--body-file"),  # noqa: B008 - typer
                upload_file: Path | None = typer.Option(None, "--upload-file"),  # noqa: B008 - typer
                form_field: str = typer.Option("file", "--form-field"),
                output: Path | None = typer.Option(None, "--output"),  # noqa: B008 - typer
                yes: bool = typer.Option(False, "--yes"),
                pretty: bool = typer.Option(False, "--pretty")):
    """Call any local /api/ endpoint; JSON in/out and multipart upload supported."""
    try:
        result = call_api(method, path, port=port, body_file=body_file, upload_file=upload_file,
                          form_field=form_field, output=output, confirmed=yes)
    except (ValueError, OSError) as exc:
        fail(str(exc), 2)
    emit(result, pretty)


@connectors_cli.command("approve")
def connectors_approve(name: str, yes: bool = typer.Option(False, "--yes"),
                       pretty: bool = typer.Option(False, "--pretty")):
    """Explicitly approve the exact reviewed permissions for one connector."""
    manifest = verified_registry().get(name)
    if manifest is None or manifest.review_status != "verified":
        fail("Konnektor ist nicht in der geprüften Registry", 2)
    if not yes:
        fail("Berechtigungen mit 'unios connectors list' prüfen und --yes angeben", 2)
    ConnectorPermissions(get_settings().local_dir).append(manifest, "approve")
    emit({"id": name, "approved": True, "fingerprint": manifest.fingerprint}, pretty)


@connectors_cli.command("revoke")
def connectors_revoke(name: str, yes: bool = typer.Option(False, "--yes"),
                      pretty: bool = typer.Option(False, "--pretty")):
    """Revoke a local connector grant without deleting its audit trail."""
    manifest = verified_registry().get(name)
    if manifest is None:
        fail("Konnektor ist nicht in der Registry", 2)
    if not yes:
        fail("Entzug mit --yes bestätigen", 2)
    ConnectorPermissions(get_settings().local_dir).append(manifest, "revoke")
    emit({"id": name, "approved": False}, pretty)


@demo_cli.command("create")
def demo_create(directory: str = typer.Option("demo-workspace", "--directory", "-d"),
                pretty: bool = typer.Option(False, "--pretty")):
    """Create or complete a separate semester containing invented data."""
    try:
        result = create_demo(Path(directory))
    except (ValueError, HostLeaseError, OSError) as exc:
        fail(str(exc), 3)
    emit(result, pretty)


@demo_cli.command("serve")
def demo_serve(directory: str = typer.Option("demo-workspace", "--directory", "-d"),
               port: int = typer.Option(8766, "--port", min=1024, max=65535)):
    """Open the isolated demo locally without university connectors or sync."""
    import uvicorn

    from app.main import create_app

    try:
        settings = demo_settings(Path(directory))
    except ValueError as exc:
        fail(str(exc), 3)
    if not settings.react_dist_dir.is_dir():
        fail("Frontend fehlt; zuerst im frontend-Ordner 'npm run build' ausführen", 3)
    typer.echo(f"Demo: http://127.0.0.1:{port}")
    uvicorn.run(create_app(settings, connectors=[], start_scheduler=False), host="127.0.0.1", port=port)


@host_cli.command("status")
def host_status(pretty: bool = typer.Option(False, "--pretty")):
    """Show the current shared host without changing it."""
    coordinator = HostCoordinator(get_settings())
    lease = coordinator.current()
    emit({"mode": "unclaimed" if lease is None else "released" if lease.released_at else "claimed",
          "device_name": lease.device_name if lease else None,
          "generation": lease.generation if lease else None, "heartbeat_at": lease.heartbeat_at if lease else None,
          "released_at": lease.released_at if lease else None}, pretty)


@host_cli.command("acquire")
def host_acquire(pretty: bool = typer.Option(False, "--pretty"),
                 after_failure: bool = typer.Option(False, "--after-failure")):
    """Create the first lease or claim a verified release or failed host."""
    settings = get_settings()
    if settings.server_mode:
        fail("Ein fester UniOS-Server kann nicht auf ein anderes Gerät übergeben werden", 3)
    coordinator = HostCoordinator(settings)
    try:
        current = coordinator.current()
        lease = (acquire_stale(settings) if after_failure else
                 acquire_released(settings) if current is not None and current.released_at else
                 coordinator.acquire_initial())
    except HostLeaseError as exc:
        fail(str(exc), 3)
    emit({"device_name": lease.device_name, "generation": lease.generation,
          "message": "Staffelstab übernommen; Dienst neu starten" if after_failure or (current is not None and current.released_at)
          else "Staffelstab eingerichtet; Dienst neu starten"}, pretty)


@host_cli.command("release")
def host_release(pretty: bool = typer.Option(False, "--pretty")):
    """Stop the local service first, then publish a verified planned release."""
    settings = get_settings()
    if settings.server_mode:
        fail("Ein fester UniOS-Server kann nicht auf ein anderes Gerät übergeben werden", 3)
    coordinator = HostCoordinator(settings)
    try:
        released = coordinator.release_offline(pre_release_check=lambda: require_syncthing_ready(settings))
    except HostLeaseError as exc:
        fail(str(exc), 3)
    emit({"device_name": released.device_name, "generation": released.generation,
          "released_at": released.released_at, "message": "Staffelstab freigegeben"}, pretty)


@host_cli.command("snapshot")
def host_snapshot(pretty: bool = typer.Option(False, "--pretty")):
    """Create a verified handoff snapshot while the host service is stopped."""
    with held_host(get_settings(), "Kein Staffelstab oder bereits aktive Host-Instanz") as coordinator:
        emit(asdict(create_snapshot(coordinator)), pretty)


@cli.command()
def status(pretty: bool = typer.Option(False, "--pretty")):
    """Show the latest sync and connector health."""
    _, factory = get_factory()
    with factory() as session:
        latest = session.scalar(select(SyncRun).order_by(SyncRun.id.desc()).limit(1))
        health = session.scalars(select(ConnectorHealth).order_by(ConnectorHealth.connector)).all()
        emit({"last_sync": {"started_at": latest.started_at, "status": latest.status,
                            "course_count": latest.course_count, "change_count": latest.change_count} if latest else None,
              "connectors": [{"name": item.connector, "status": item.status,
                              "last_success_at": item.last_success_at, "message": item.message} for item in health]}, pretty)


@cli.command()
def courses(all_semesters: bool = typer.Option(False, "--all-semesters"),
            pretty: bool = typer.Option(False, "--pretty")):
    """List courses."""
    _, factory = get_factory()
    with factory() as session:
        query = select(Course).order_by(Course.name)
        if not all_semesters:
            query = query.join(Semester).where(Semester.is_current.is_(True))
        items = session.scalars(query).all()
        emit([{"id": item.id, "name": item.name, "source": item.source,
               "semester_id": item.semester_id} for item in items], pretty)


@cli.command("ocr")
def recognize_pdf(version_id: int = typer.Argument(..., min=1),
                  pretty: bool = typer.Option(False, "--pretty")):
    """Recognize scanned PDF pages locally and update the search index."""
    settings = get_settings()
    refusal = "Nur das aktuelle Hauptgerät kann Texterkennung starten; laufenden Dienst verwenden"
    with held_host(settings, refusal) as coordinator:
        engine = make_engine(settings, coordinator)
        try:
            service = OCRService(OCRRepository(make_session_factory(engine)), settings)
            state = service.status(version_id)
            while state.pending_pages:
                state = service.process(version_id)
            emit(state.model_dump(), pretty)
        except (LookupError, OCRError) as exc:
            fail(str(exc), 2)
        finally:
            engine.dispose()


@cli.command("ai-costs")
def ai_costs(pretty: bool = typer.Option(False, "--pretty")):
    """Local, network-free cost estimate for freigegebene AI material."""
    _, factory = get_factory()
    with factory() as session:
        emit(estimate_costs(session), pretty)


@cli.command("schema")
def result_schema(kind: str = typer.Argument("entities"), pretty: bool = typer.Option(False, "--pretty"),
                  json_output: bool = typer.Option(False, "--json")):
    """Show entity schema; cards, exercises, explanations or all retain AI formats."""
    if kind == "entities":
        contract = catalog().model_dump()
        if json_output or pretty:
            emit(contract, pretty=True)
        else:
            for entity in contract["entities"]:
                typer.echo(f"{entity['kind']}\t{entity['label']}")
        return
    schemas = {"cards": CardImport.model_json_schema(), "exercises": ExerciseImport.model_json_schema(),
               "explanations": ExplanationImport.model_json_schema()}
    if kind not in {"all", *schemas}:
        fail("Format muss all, cards, exercises oder explanations sein", 2)
    emit(schemas if kind == "all" else schemas[kind], pretty)


@cli.command()
def changes(since: str = typer.Option("", "--since"), pretty: bool = typer.Option(False, "--pretty")):
    """List recent changes, optionally since an ISO-8601 timestamp."""
    _, factory = get_factory()
    query = select(Change).order_by(Change.created_at.desc()).limit(200)
    if since:
        try:
            parsed = datetime.fromisoformat(since)
            if parsed.tzinfo is None:
                fail("--since benötigt eine Zeitzone", 2)
            query = query.where(Change.created_at >= parsed.astimezone(UTC).replace(tzinfo=None))
        except ValueError:
            fail("Ungültiges ISO-8601-Datum", 2)
    with factory() as session:
        emit([{"id": item.id, "kind": item.kind, "summary": item.summary,
               "course_id": item.course_id, "created_at": item.created_at}
              for item in session.scalars(query).all()], pretty)


@cli.command()
def sync(pretty: bool = typer.Option(False, "--pretty")):
    """Run a single polite synchronization."""
    settings = get_settings()
    if not settings.moodle_enabled:
        fail("Moodle-Connector ist deaktiviert", 2)
    if not settings.moodle_base_url or not settings.moodle_token:
        fail("Moodle-Adresse oder Token fehlt", 2)
    with held_host(settings, "Kein Staffelstab oder bereits aktive Host-Instanz") as coordinator:
        factory = make_session_factory(make_engine(settings, coordinator))
        result = SyncEngine(factory, settings, [MoodleClient(settings)], Notifier(settings, coordinator), coordinator).run()
    if result is None:
        fail("Sync läuft bereits", 3)
    emit({"id": result.id, "status": result.status, "course_count": result.course_count,
          "resource_count": result.resource_count, "change_count": result.change_count}, pretty)
    if result.status == "error":
        raise typer.Exit(1)


@cli.command("rebuild-index")
def rebuild_index_command(pretty: bool = typer.Option(False, "--pretty")):
    """Recreate resource records from verified immutable sidecars."""
    settings = get_settings()
    project_root = Path(__file__).resolve().parents[2]
    with (held_host(settings, "Kein Staffelstab oder bereits aktive Host-Instanz") as coordinator,
          ActionJournal(settings).tracked_operation(coordinator, "rebuild-index")):
        config = Config(str(project_root / "alembic.ini"))
        config.set_main_option("script_location", str(project_root / "alembic"))
        config.attributes["settings"] = settings
        config.attributes["host_coordinator"] = coordinator
        command.upgrade(config, "head")
        factory = make_session_factory(make_engine(settings, coordinator))
        result = rebuild_index(factory, settings.data_dir)
        annotation_result = rebuild_annotation_index(factory, settings.data_dir)
        emit({**result, "annotation_logs": annotation_result["logs"],
              "annotations_created": annotation_result["created"]}, pretty)


@cli.command()
def backup(pretty: bool = typer.Option(False, "--pretty")):
    """Create a local SQLite copy and an encrypted restic backup."""
    settings = get_settings()
    with held_host(settings, "Kein Staffelstab oder bereits aktive Host-Instanz; Host-Dienst beenden") as coordinator:
        result = backup_main(coordinator, quiet=True)
    if result:
        fail("Datensicherung fehlgeschlagen; Status im Systembereich prüfen")
    emit({"status": "success"}, pretty)


@cli.command()
def export(output: Path = typer.Option(..., "--output"),  # noqa: B008 - typer needs the call as the default
          include_files: bool = typer.Option(False, "--include-files"),
          pretty: bool = typer.Option(False, "--pretty")):
    """Write the same personal-data export ZIP as GET /api/export to a local file."""
    if output.exists():
        fail("Zieldatei existiert bereits", 2)
    settings = get_settings()
    try:
        build_export(settings, output, include_files=include_files)
    except (FileNotFoundError, ValueError) as exc:
        fail(str(exc), 2)
    emit({"output": str(output), "include_files": include_files}, pretty)


@cli.command("migrate-annotations")
def migrate_annotations_command(pretty: bool = typer.Option(False, "--pretty")):
    """Convert old marking snapshots after a separately created, verified host snapshot."""
    settings = get_settings()
    with (held_host(settings, "Host-Dienst beenden; nur der aktuelle Host darf Markierungen migrieren") as coordinator,
          ActionJournal(settings).tracked_operation(coordinator, "migrate-annotations")):
        lease = coordinator.current()
        if lease is None:
            fail("Aktueller Host fehlt", 3)
        factory = make_session_factory(make_engine(settings, coordinator))
        emit(migrate_legacy_annotations(factory, settings.data_dir,
                                        generation=lease.generation, device_id=lease.device_id), pretty)


@cli.command("rebuild-annotations")
def rebuild_annotations_command(pretty: bool = typer.Option(False, "--pretty")):
    """Rebuild only the annotation index, without upgrading the database schema."""
    settings = get_settings()
    with (held_host(settings, "Kein Staffelstab oder bereits aktive Host-Instanz; Host-Dienst beenden") as coordinator,
          ActionJournal(settings).tracked_operation(coordinator, "rebuild-annotations")):
        factory = make_session_factory(make_engine(settings, coordinator))
        emit(rebuild_annotation_index(factory, settings.data_dir), pretty)


@cli.command()
def doctor(pretty: bool = typer.Option(False, "--pretty")):
    """Check local prerequisites without contacting university systems."""
    emit(doctor_report(get_settings()), pretty)


@cli.command()
def pair(pretty: bool = typer.Option(False, "--pretty")):
    """Print a one-time pairing URL for a second device (phone, other computer)."""
    settings = get_settings()
    store = SessionStore(settings.local_dir)
    code = store.create_pairing_code()
    try:
        url = pairing_url(settings, code)
    except RemoteAddressNotConfigured as exc:
        fail(str(exc))
    emit({"url": url, "expires_in_seconds": PAIRING_CODE_TTL_SECONDS,
          "message": "Adresse auf dem zweiten Gerät im Browser öffnen; gilt einmalig für 10 Minuten"}, pretty)


SEARCH_TYPES = {"all", "documents", "announcements", "annotations", "course_notes", "notes", "jots", "clips"}


@cli.command()
def search(query: str = typer.Argument(..., help="Suchbegriff"),
          course: int | None = typer.Option(None, "--course"),
          result_type: str = typer.Option("all", "--type", help="Einer von " + ", ".join(sorted(SEARCH_TYPES))),
          pretty: bool = typer.Option(False, "--pretty")):
    """Search documents, announcements, annotations, notes, jots and clips."""
    if result_type not in SEARCH_TYPES:
        fail(f"--type muss einer von {', '.join(sorted(SEARCH_TYPES))} sein", 2)
    if len(query) > 120:
        fail("Suchbegriff zu lang", 2)
    has_query = bool(query.strip())
    _, factory = get_factory()
    with factory() as session:
        result: dict[str, object] = {}
        if result_type in ("all", "documents"):
            result["results"] = search_documents(session, query, course) if has_query else []
        if result_type in ("all", "announcements"):
            result["announcement_results"] = search_announcements(session, query, course) if has_query else []
        if result_type in ("all", "annotations"):
            result["annotation_results"] = search_annotations(session, query, course) if has_query else []
        if result_type in ("all", "course_notes"):
            result["course_note_results"] = search_course_notes(session, query, course) if has_query else []
        if result_type in ("all", "notes"):
            result["note_results"] = search_notes(session, query, course_id=course) if has_query else []
        if result_type in ("all", "jots"):
            result["jot_results"] = search_jots(session, query, course_id=course) if has_query else []
        if result_type in ("all", "clips"):
            result["clip_results"] = search_clips(session, query, course) if has_query else []
        if result_type == "all":
            result["courses"] = [record(item) for item in session.scalars(select(Course).order_by(Course.name)).all()]
            result["semesters"] = [record(item) for item in session.scalars(select(Semester).order_by(Semester.id.desc())).all()]
        emit(result, pretty)


@cli.command()
def deadlines(days: int = typer.Option(14, "--days", help="Zeitfenster in Tagen ab jetzt"),
             pretty: bool = typer.Option(False, "--pretty")):
    """List upcoming deadlines within the given number of days."""
    if days < 1:
        fail("--days muss mindestens 1 sein", 2)
    _, factory = get_factory()
    with factory() as session:
        emit([record(item) for item in upcoming_deadlines(session, days)], pretty)


@anki_cli.command("queue")
def anki_queue(status: str | None = typer.Option(None, "--status",
                                                  help="proposed, approved, rejected oder pushed"),
              pretty: bool = typer.Option(False, "--pretty")):
    """List Anki card proposals, optionally filtered by status."""
    valid_statuses = {"proposed", "approved", "rejected", "pushed"}
    if status is not None and status not in valid_statuses:
        fail(f"--status muss einer von {', '.join(sorted(valid_statuses))} sein", 2)
    _, factory = get_factory()
    with factory() as session:
        items = list_card_queue(session, status)
        emit([item.model_dump(mode="json") for item in items], pretty)


@cards_cli.command("import")
def cards_import(file: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),  # noqa: B008 - typer needs the call as the default
                 pretty: bool = typer.Option(False, "--pretty")):
    """Import card proposals from an outbox-format JSON file; they always land as 'proposed'."""
    settings = get_settings()
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        fail("Ungültige JSON-Datei", 2)
    try:
        payload = CardImport.model_validate(data)
    except ValidationError as exc:
        fail("Ungültiges Kartenformat: " + "; ".join(
            ".".join(map(str, error["loc"])) or "Dokument" for error in exc.errors()[:5]), 2)
    with held_host(settings, "Kein Staffelstab oder bereits aktive Host-Instanz") as coordinator:
        factory = make_session_factory(make_engine(settings, coordinator))
        with factory() as session:
            try:
                created = enqueue_cards(session, settings, payload)
            except HTTPException as exc:
                fail(str(exc.detail), 2)
            session.commit()
            emit([item.model_dump(mode="json") for item in created], pretty)


@cards_cli.command("export")
def cards_export(output: Path = typer.Option(..., "--output"),  # noqa: B008 - typer needs the call as the default
                 pretty: bool = typer.Option(False, "--pretty")):
    """Export approved card proposals as JSON."""
    _, factory = get_factory()
    with factory() as session:
        items = list_card_queue(session, "approved")
    data = [item.model_dump(mode="json") for item in items]
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    emit({"output": str(output), "exported": len(data)}, pretty)


@ai_cli.command("export")
def ai_export(course: int = typer.Option(..., "--course"),
             mode: str = typer.Option("cards", "--mode", help="cards, questions oder exercises"),
             output: Path = typer.Option(..., "--output"),  # noqa: B008 - typer needs the call as the default
             pretty: bool = typer.Option(False, "--pretty")):
    """Create the same AI export package ZIP as POST /api/ai/package for one course."""
    if mode not in {"cards", "questions", "exercises"}:
        fail("--mode muss cards, questions oder exercises sein", 2)
    valid_mode = cast(Literal["cards", "questions", "exercises"], mode)
    if output.exists():
        fail("Zieldatei existiert bereits", 2)
    settings = get_settings()
    with held_host(settings, "Kein Staffelstab oder bereits aktive Host-Instanz") as coordinator:
        factory = make_session_factory(make_engine(settings, coordinator))
        with factory() as session:
            try:
                built = build_ai_package(session, settings,
                                         AiPackageRequest(course_id=course, mode=valid_mode, output="zip"))
            except HTTPException as exc:
                fail(str(exc.detail), 2)
        try:
            output.write_bytes(built.content)
        except OSError as exc:
            fail(f"Zieldatei konnte nicht geschrieben werden: {type(exc).__name__}")
        emit({"output": str(output), "bytes": len(built.content)}, pretty)


@cli.command()
def describe(command_path: list[str] = typer.Argument(..., help="Befehlspfad, z. B. host status"),  # noqa: B008 - typer needs the call as the default
            pretty: bool = typer.Option(False, "--pretty"),
            json_output: bool = typer.Option(False, "--json")):
    """Describe an entity kind or inspect a CLI command."""
    if len(command_path) == 1 and command_path[0] in {item.kind for item in catalog().entities}:
        entity = describe_entity(cast(EntityKind, command_path[0])).model_dump()
        if json_output or pretty:
            emit(entity, pretty=True)
        else:
            typer.echo(f"{entity['label']} ({entity['kind']})")
            for field in entity["fields"]:
                typer.echo(f"{field['name']}\t{field['type']}")
        return
    node = typer.main.get_command(cli)
    seen: list[str] = []
    for part in command_path:
        seen.append(part)
        subcommands = getattr(node, "commands", None)
        if not isinstance(subcommands, dict) or part not in subcommands:
            fail(f"Unbekannter Befehl: {' '.join(seen)}", 2)
        node = subcommands[part]
    parameters = []
    for param in node.params:
        parameters.append({
            "name": param.name,
            "flags": list(param.opts),
            "type": getattr(param.type, "name", type(param.type).__name__),
            "required": bool(getattr(param, "required", False)),
            "default": param.default,
            "help": getattr(param, "help", None),
        })
    emit({"name": " ".join(command_path), "help": node.help or node.short_help, "parameters": parameters}, pretty)


@cli.command()
def setup(yes: bool = typer.Option(False, "--yes", help="Bestätigungen überspringen"),
         pretty: bool = typer.Option(False, "--pretty")):
    """Geführte, nicht-destruktive Einrichtung im Terminal: prüft Voraussetzungen und nennt nächste Schritte."""
    settings = get_settings()
    report = doctor_report(settings)
    checks = cast(dict[str, bool], report["checks"])
    steps = []
    if not checks["data_dir_exists"] or not checks["data_dir_writable"]:
        steps.append(f"Datenordner {settings.data_dir} anlegen und beschreibbar machen")
    if not checks["moodle_configured"]:
        steps.append("Moodle-Token mit 'python scripts/setup_token.py' einrichten (fragt nie automatisch ab)")
    if not checks["database_reachable"]:
        steps.append("Datenbank mit 'rebuild-index' nach einer Migration aufbauen")
    if not checks["host_lease_matches_device"]:
        steps.append("Staffelstab mit 'host acquire' auf diesem Gerät übernehmen")
    emit({"checks": checks, "diagnostics": report["diagnostics"], "ready_for_sync": report["ready_for_sync"],
          "next_steps": steps, "confirmed": yes or not steps}, pretty)


def main() -> None:
    try:
        cli()
    except typer.Exit:
        raise
    except Exception as exc:  # noqa: BLE001 - CLI boundary returns only the exception type, never secrets
        typer.echo(json.dumps({"error": type(exc).__name__}, ensure_ascii=False), file=sys.stderr)
        raise typer.Exit(1) from None


if __name__ == "__main__":
    main()
