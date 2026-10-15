# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read existing incoming sources and persist only their triage decisions."""

from dataclasses import dataclass
from datetime import UTC, datetime
from threading import RLock
from typing import Any

from sqlalchemy import select

from app.config import Settings
from app.db.models import (
    Assignment,
    Course,
    InboxClip,
    IntakeDecision,
    Jot,
    LearningTopic,
    MailItem,
    Project,
    Resource,
    VoiceMemo,
    utc_now,
)

INTAKE_WRITE_LOCK = RLock()


@dataclass(frozen=True)
class Incoming:
    kind: str
    id: str
    title: str
    detail: str
    url: str
    course_id: int | None
    at: datetime
    critical: bool = False
    already_accepted: bool = False


class IntakeRepository:
    def __init__(self, factory, settings: Settings):
        self.factory = factory
        self.settings = settings
        self._write_lock = INTAKE_WRITE_LOCK

    def sources(self) -> tuple[list[Incoming], dict[tuple[str, str], IntakeDecision]]:
        with self.factory() as session:
            items: list[Incoming] = []
            clips = session.scalars(select(InboxClip).order_by(InboxClip.created_at.desc()).limit(200))
            for row in clips:
                items.append(Incoming("clip", row.id, row.title, "Website" if row.kind == "web" else "Text",
                                      row.url or f"/inbox#clip-{row.id}", row.course_id, row.created_at,
                                      already_accepted=row.filed))
            voice = session.scalars(select(VoiceMemo).order_by(VoiceMemo.created_at.desc()).limit(100)).all()
            voice_jots = {row.jot_id for row in voice if row.jot_id}
            for row in voice:
                items.append(Incoming("voice", row.id, row.title, "Sprachnotiz", "/voice", row.course_id,
                                      row.created_at))
            jots = session.scalars(select(Jot).order_by(Jot.created_at.desc()).limit(100))
            for row in jots:
                if row.id not in voice_jots:
                    items.append(Incoming("jot", row.id, row.body[:120], "Schnellerfassung",
                                          f"/jots#jot-{row.id}", row.course_id, row.created_at,
                                          already_accepted=row.course_id is not None))
            mail = session.scalars(select(MailItem).order_by(MailItem.imported_at.desc()).limit(50))
            for row in mail:
                items.append(Incoming("mail", str(row.id), row.subject, "Uni-Mail", "/mail", None,
                                      row.imported_at, critical=bool(row.deadline_id or row.candidate_date)))
            resources = session.scalars(select(Resource).where(Resource.source == "moodle")
                                        .order_by(Resource.last_seen_at.desc()).limit(100))
            for row in resources:
                items.append(Incoming("material", str(row.id), row.name, "Moodle-Material",
                                      f"/courses/{row.course_id}#resource-{row.id}", row.course_id,
                                      row.last_seen_at, already_accepted=True))
            assignments = session.scalars(select(Assignment).where(Assignment.source == "moodle")
                                          .order_by(Assignment.last_seen_at.desc()).limit(100))
            for row in assignments:
                items.append(Incoming("assignment", str(row.id), row.title, "Moodle-Aufgabe",
                                      f"/courses/{row.course_id}#assignment-{row.id}", row.course_id,
                                      row.last_seen_at, critical=row.due_at is not None, already_accepted=True))
            folder = self.settings.data_dir / "drop"
            if folder.is_dir() and not folder.is_symlink() and folder.resolve().is_relative_to(self.settings.data_dir.resolve()):
                for path in sorted(folder.iterdir(), key=lambda item: item.name.casefold())[:100]:
                    if path.name.startswith(".") or path.is_symlink() or not path.is_file():
                        continue
                    try:
                        stat = path.stat()
                    except FileNotFoundError:
                        continue
                    resource = session.scalar(select(Resource).where(Resource.source == "manual",
                                                                      Resource.source_key == path.name))
                    imported = bool(resource and resource.upstream_modified == stat.st_mtime_ns
                                    and resource.upstream_size == stat.st_size)
                    items.append(Incoming("file", path.name, path.name, "Eigene Datei", "/drop",
                                          resource.course_id if resource else None,
                                          datetime.fromtimestamp(stat.st_mtime, UTC), already_accepted=imported))
            decisions = session.scalars(select(IntakeDecision)).all()
            return items, {(row.source_kind, row.source_id): row for row in decisions}

    def course_exists(self, course_id: int) -> bool:
        with self.factory() as session:
            return session.get(Course, course_id) is not None

    def target_exists(self, kind: str, target_id: str, course_id: int) -> bool:
        model = {"topic": LearningTopic, "assignment": Assignment,
                 "material": Resource, "project": Project}[kind]
        if not target_id.isdecimal():
            return False
        with self.factory() as session:
            target = session.get(model, int(target_id))
            return bool(target and target.course_id == course_id)

    def targets(self, course_id: int) -> list[tuple[str, str, str]]:
        with self.factory() as session:
            result: list[tuple[str, str, str]] = []
            for kind, model, label in (("topic", LearningTopic, "name"),
                                       ("assignment", Assignment, "title"),
                                       ("material", Resource, "name"),
                                       ("project", Project, "name")):
                rows = session.scalars(select(model).where(model.course_id == course_id).limit(100))
                result.extend((kind, str(row.id), str(getattr(row, label))) for row in rows)
            return result

    def save(self, kind: str, source_id: str, expected_revision: int, state: str,
             course_id: int | None, target_kind: str | None, target_id: str | None,
             duplicate_of: str | None, snoozed_until: datetime | None, initial_state: str = "new", initial_course: int | None = None) -> bool:
        with self._write_lock:
            return self._save_locked(kind, source_id, expected_revision, state, course_id,
                                     target_kind, target_id, duplicate_of, snoozed_until, initial_state, initial_course)

    def _save_locked(self, kind: str, source_id: str, expected_revision: int, state: str,
                     course_id: int | None, target_kind: str | None, target_id: str | None,
                     duplicate_of: str | None, snoozed_until: datetime | None, initial_state: str = "new", initial_course: int | None = None) -> bool:
        with self.factory() as session:
            row = session.scalar(select(IntakeDecision).where(IntakeDecision.source_kind == kind,
                                                               IntakeDecision.source_id == source_id))
            if (row.revision if row else 0) != expected_revision:
                return False
            from app.local_actions.repository import record

            prior: dict[str, Any] = {key: getattr(row, key) for key in ("state", "course_id", "target_kind", "target_id", "duplicate_of", "snoozed_until")} if row else {
                "state": initial_state, "course_id": initial_course, "target_kind": None, "target_id": None, "duplicate_of": None, "snoozed_until": None,
            }
            if prior["snoozed_until"]:
                prior["snoozed_until"] = prior["snoozed_until"].isoformat()
            before = {"source_kind": kind, "decision": prior}
            original_clip = session.get(InboxClip, source_id) if kind == "clip" else None
            if original_clip is not None:
                before["clip"] = {"course_id": original_clip.course_id, "filed": original_clip.filed, "expected": original_clip.revision + 1}
            record(session, "intake", source_id, before, expected_revision + 1, course_id)
            now = utc_now()
            if row is None:
                row = IntakeDecision(source_kind=kind, source_id=source_id, revision=0, created_at=now)
                session.add(row)
            row.state = state
            row.course_id = course_id
            row.target_kind = target_kind
            row.target_id = target_id
            row.duplicate_of = duplicate_of
            row.snoozed_until = snoozed_until
            row.revision += 1
            row.updated_at = now
            if kind == "clip":
                clip = session.get(InboxClip, source_id)
                if clip is not None:
                    clip.course_id = course_id
                    clip.filed = state == "accepted"
                    clip.revision += 1
                    clip.updated_at = now
            session.commit()
            return True
