# SPDX-License-Identifier: AGPL-3.0-or-later

"""Build an isolated persistent semester from invented content only."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pymupdf
from alembic.config import Config
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)
from sqlalchemy import select

from alembic import command
from app.anki.collection import (
    add_approved_note,
    open_collection,
    study_mode,
    write_study_mode,
)
from app.config import Settings
from app.db.models import Note
from app.db.session import make_engine, make_session_factory
from app.demo.repository import DemoRepository
from app.files.atomic import ensure_directory, write_once
from app.host.lease import HostCoordinator, HostLeaseError
from app.notes.store import create_note

MARKER = ".unios-demo.json"


class DemoSettings(Settings):
    """No environment, dotenv or file-secret sources can enter a demo instance."""
    model_config = SettingsConfigDict(env_file=None, extra='ignore')

    @classmethod
    def settings_customise_sources(cls, settings_cls: type[BaseSettings],
                                   init_settings: PydanticBaseSettingsSource,
                                   env_settings: PydanticBaseSettingsSource,
                                   dotenv_settings: PydanticBaseSettingsSource,
                                   file_secret_settings: PydanticBaseSettingsSource
                                   ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (init_settings,)


COURSES = (
    ("programmieren", "Programmieren 1", "Schleifen und Funktionen"),
    ("mathematik", "Mathematik", "Lineare Gleichungen"),
    ("grundlagen", "Grundlagen Informatik", "Daten und Algorithmen"),
    ("englisch", "Englisch", "Academic Writing"),
)

DEMO_CARDS = (
    ("Was wiederholt eine Schleife?", "Eine Folge von Anweisungen."),
    ("Wann endet eine while-Schleife?", "Wenn ihre Bedingung falsch wird."),
    ("Was ist eine Variable?", "Ein benannter Speicher für einen Wert."),
    ("Was ist der Basisfall einer Rekursion?", "Der Fall ohne weiteren rekursiven Aufruf."),
    ("Was liefert eine Funktion zurück?", "Ihr Ergebnis an die aufrufende Stelle."),
    ("Was ist ein Array?", "Eine über einen Index erreichbare Folge von Elementen."),
    ("Wie löst man x + 3 = 7?", "Auf beiden Seiten 3 abziehen: x = 4."),
    ("Welche Eigenschaft hat eine Äquivalenzumformung?", "Die Lösungsmenge bleibt gleich."),
    ("Wie löst man 2x = 10?", "Beide Seiten durch 2 teilen: x = 5."),
    ("Was beschreibt ein Algorithmus?", "Eine endliche Folge eindeutiger Schritte zur Problemlösung."),
    ("Wie viele verschiedene Werte hat ein Bit?", "Zwei: 0 und 1."),
    ("Wie viele Bits hat ein Byte?", "Acht."),
    ("What is the purpose of a topic sentence?", "It introduces a paragraph's main idea."),
    ("What does a citation identify?", "The source of a claim or quotation."),
    ("What is a concise sentence?", "A sentence using only the words needed to convey its meaning."),
)

DEMO_TEXT = {
    "programmieren": (
        "Eine for-Schleife verarbeitet die Elemente einer Folge. Eine while-Schleife läuft, "
        "solange ihre Bedingung wahr ist. Eine Funktion fasst Schritte zusammen und kann ein Ergebnis zurückgeben.\n\n"
        "Beispiel: Die Werte 0, 1 und 2 werden jeweils um 1 erhöht. Die Ausgabe lautet 1, 2, 3.\n\n"
        "Zum Üben: Erkläre, warum eine while-Schleife eine erreichbare Abbruchbedingung braucht."
    ),
    "mathematik": (
        "Eine Gleichung beschreibt zwei Ausdrücke mit gleichem Wert. Eine Äquivalenzumformung "
        "erhält ihre Lösungsmenge. Addiere oder subtrahiere denselben Wert auf beiden Seiten.\n\n"
        "Beispiel: 2x + 4 = 10. Nach Subtraktion von 4 folgt 2x = 6. Division durch 2 ergibt x = 3.\n\n"
        "Zum Üben: Löse 3x - 6 = 12 und prüfe dein Ergebnis durch Einsetzen."
    ),
    "grundlagen": (
        "Ein Bit kann zwei Werte darstellen: 0 und 1. Acht Bits bilden ein Byte. "
        "Ein Algorithmus beschreibt eine endliche Folge eindeutiger Schritte zur Problemlösung.\n\n"
        "Beispiel: Um die kleinste Zahl einer Liste zu finden, vergleiche jedes Element mit dem bisherigen Minimum.\n\n"
        "Zum Üben: Beschreibe diesen Algorithmus in eigenen Worten und teste ihn mit 7, 2, 9."
    ),
    "englisch": (
        "A paragraph presents one main idea. Its topic sentence introduces that idea. "
        "Supporting sentences give examples or evidence. A citation identifies the source of a claim.\n\n"
        "Example: Regular practice helps students remember concepts. Short daily sessions make repetition manageable.\n\n"
        "Practice: Write a topic sentence and two supporting sentences about your study routine."
    ),
}


def _seed_cards(settings: Settings) -> None:
    """Only the guarded demo collection, with stable keys for repeatable creation."""
    with open_collection(settings) as collection:
        for number, (front, back) in enumerate(DEMO_CARDS, 1):
            course = "Programmieren 1" if number <= 6 else "Mathematik" if number <= 9 else (
                "Grundlagen Informatik" if number <= 12 else "Englisch")
            add_approved_note(collection, queue_id=number, card_type="basic", front=front, back=back,
                              course=course, topic="Demo-Grundlagen", semester="Demo-Semester 1",
                              source_file="Erfundenes Demo-Semester", source_page=None)
    if study_mode(settings) != "integrated":
        write_study_mode(settings, "integrated")


def _pdf(title: str, body: str) -> bytes:
    document = pymupdf.open()
    for number in range(1, 4):
        page = document.new_page()
        page.draw_rect(pymupdf.Rect(0, 0, 595, 14), color=None, fill=(0.2, 0.45, 0.5))
        page.insert_text((60, 52), "UNIOS / DEMO-SEMESTER", fontsize=9, color=(0.3, 0.4, 0.4))
        page.insert_text((60, 92), title, fontsize=20)
        page.insert_textbox(pymupdf.Rect(60, 125, 520, 650),
                            f"Demo-Material · Seite {number}\n\n{body}\n\n"
                            "Alle Angaben in diesem Dokument sind erfunden.", fontsize=12)
        page.insert_text((60, 780), f"Beispielmaterial zum Ausprobieren / {number} von 3", fontsize=9)
    content = document.tobytes()
    document.close()
    return content


def _demo_settings(root: Path) -> Settings:
    local_dir = root / "local"
    project_root = Path(__file__).resolve().parents[2]
    return DemoSettings(_env_file=None, data_dir=root / "data", local_dir=local_dir,  # type: ignore[call-arg]
                    database_url=f"sqlite:///{(local_dir / 'uni_os.sqlite3').as_posix()}",
                    serve_react=True, react_dist_dir=project_root / "frontend" / "dist",
                    moodle_enabled=False, moodle_base_url="", moodle_token="",
                    public_periods_enabled=False, automatic_takeover_enabled=False,
                    host_health_url="", ntfy_url="", discord_webhook_url="", github_token="",
                    connector_plugins="", mcp_enabled=False, ai_adapter_enabled=False)


def create_demo(directory: Path) -> dict[str, object]:
    if directory.expanduser().is_symlink():
        raise ValueError("Ein Demo-Ordner darf kein symbolischer Link sein")
    root = directory.expanduser().resolve()
    marker = root / MARKER
    if root.is_symlink() or (root.exists() and any(root.iterdir()) and not marker.is_file()):
        raise ValueError("Der Zielordner enthält Daten und ist kein UniOS-Demo-Ordner")
    if marker.is_file():
        try:
            if json.loads(marker.read_text(encoding="utf-8")).get("kind") != "marc-uni-os-demo":
                raise ValueError("Ungültiger Demo-Marker")
        except (json.JSONDecodeError, OSError) as exc:
            raise ValueError("Demo-Marker ist nicht lesbar") from exc
    root.mkdir(parents=True, exist_ok=True)
    settings = _demo_settings(root)
    settings.local_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    coordinator = HostCoordinator(settings)
    coordinator.acquire_initial()
    if not coordinator.start(background=False):
        raise HostLeaseError("Der Demo-Ordner wird bereits von einer anderen Instanz verwendet")
    try:
        project_root = Path(__file__).resolve().parents[2]
        config = Config(str(project_root / "alembic.ini"))
        config.set_main_option("script_location", str(project_root / "alembic"))
        config.attributes["settings"] = settings
        config.attributes["host_coordinator"] = coordinator
        command.upgrade(config, "head")
        engine = make_engine(settings, coordinator)
        try:
            factory = make_session_factory(engine)
            now = datetime.now(UTC)
            with factory() as session:
                repo = DemoRepository(session)
                semester = repo.semester()
                course_ids: dict[str, int] = {}
                first_resource = 0
                for key, name, subject in COURSES:
                    course = repo.course(semester.id, key, name)
                    course_ids[key] = course.id
                    section = repo.section(course.id, "week-1", "Woche 1 · Grundlagen")
                    for number in range(1, 4):
                        label = ("Überblick", "Beispiele", "Selbsttest")[number - 1]
                        title = f"{number:02d}_{subject.replace(' ', '_')}.pdf"
                        resource = repo.resource(course.id, section.id, f"{key}-{number}", f"{subject} · {label}")
                        if key == "programmieren" and number == 1:
                            first_resource = resource.id
                        text = f"{subject} · {label}\n\n{DEMO_TEXT[key]}"
                        content = _pdf(f"{subject} / {label}", text)
                        folder = ensure_directory(settings.data_dir, "uni", "demo", key)
                        target = folder / title
                        if target.exists():
                            content = target.read_bytes()
                        else:
                            write_once(target, content)
                        repo.version(resource.id, target.relative_to(settings.data_dir).as_posix(),
                                     hashlib.sha256(content).hexdigest(), len(content), text)
                programming = course_ids["programmieren"]
                assignment = repo.assignment(programming, "exercise-04", "Demo-Übungsblatt 04", now + timedelta(days=5))
                repo.deadline(programming, assignment.id, "exercise-04", assignment.title, now + timedelta(days=5))
                for key, course_id in course_ids.items():
                    for number in range(1, 3 if key == "mathematik" else 2):
                        item_key = f"{key}-practice-{number}"
                        title = f"Demo-Übung {number} · {key.capitalize()}"
                        due = now + timedelta(days=number + 2)
                        item = repo.assignment(course_id, item_key, title, due)
                        repo.deadline(course_id, item.id, item_key, title, due)
                topic = repo.topic(programming, "schleifen", "Schleifen")
                repo.card_history(first_resource, topic.id, "demo-anki-schleifen", now - timedelta(days=1))
                repo.exam_and_block(programming, topic.id, now + timedelta(days=28), now + timedelta(days=2))
                for question, solution in (
                    ("Welche Werte gibt range(3) in Python zurück?", "0, 1, 2"),
                    ("Wann ist eine while-Schleife sinnvoll?", "Wenn die Anzahl der Wiederholungen vorher nicht feststeht."),
                    ("Was muss jede endliche Rekursion erreichen?", "Einen Basisfall ohne erneuten rekursiven Aufruf."),
                    ("Was ist der Unterschied zwischen Parameter und Argument?", "Der Parameter ist der Name in der Definition; das Argument ist der übergebene Wert."),
                ):
                    repo.exercise(topic.id, question, solution)
                repo.project(programming, now + timedelta(days=14))
                repo.timeline(programming, first_resource)
                repo.commit()
            with factory() as session:
                if not session.scalar(select(Note.id).where(Note.course_id == programming,
                                                             Note.title == "Schleifen verstehen")):
                    create_note(session, settings, course_id=programming, resource_id=first_resource,
                                title="Schleifen verstehen",
                                body="# Schleifen\n\nDemo-Mitschrift zu [[Lineare Gleichungen]].\n\n"
                                     "- Eine for-Schleife verarbeitet eine Folge.\n"
                                     "- Offene Frage: Wann ist while sinnvoll?\n")
                for course_key, title, body in (
                    ("mathematik", "Lineare Gleichungen", "# Lineare Gleichungen\n\n2x + 4 = 10\n\nBeide Seiten minus 4, dann durch 2: x = 3.\n"),
                    ("grundlagen", "Mein Lernplan", "# Mein Lernplan\n\n- [ ] PDF lesen\n- [ ] Drei Begriffe erklären\n- [ ] [[Schleifen verstehen]] wiederholen\n"),
                ):
                    if not session.scalar(select(Note.id).where(Note.course_id == course_ids[course_key], Note.title == title)):
                        create_note(session, settings, course_id=course_ids[course_key], resource_id=None,
                                    title=title, body=body)
            _seed_cards(settings)
            if not marker.exists():
                write_once(marker, json.dumps({"kind": "marc-uni-os-demo", "version": 1}, indent=2).encode())
            return {"directory": str(root), "data_dir": str(settings.data_dir),
                    "local_dir": str(settings.local_dir), "courses": len(COURSES),
                    "database": str(settings.local_dir / "uni_os.sqlite3"),
                    "next": "unios demo serve --directory \"" + str(root) + "\""}
        finally:
            engine.dispose()
    finally:
        coordinator.close()


def demo_settings(directory: Path) -> Settings:
    root = directory.expanduser().resolve()
    marker = root / MARKER
    if not marker.is_file():
        raise ValueError("Zuerst mit 'unios demo create' einen Demo-Ordner anlegen")
    try:
        if json.loads(marker.read_text(encoding="utf-8")).get("kind") != "marc-uni-os-demo":
            raise ValueError("Ungültiger Demo-Marker")
    except (json.JSONDecodeError, OSError) as exc:
        raise ValueError("Demo-Marker ist nicht lesbar") from exc
    return _demo_settings(root)
