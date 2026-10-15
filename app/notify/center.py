# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import BaseModel

from app.collections.cards import due_cards
from app.db.models import utc_now
from app.notify import repository
from app.notify.service import Notifier


class NotificationView(BaseModel):
    id: int
    title: str
    body: str
    kind: str
    course_id: int | None
    created_at: datetime
    read_at: datetime | None
    muted: bool
    url: str


class CenterView(BaseModel):
    items: list[NotificationView]
    unread: int
    muted_scopes: list[str]
    courses: list[dict]
    latest_id: int = 0
    seen_material_changes: list[int] = []


class NotificationCenter:
    def __init__(self, factory, settings, coordinator):
        self.factory, self.settings, self.coordinator = factory, settings, coordinator

    def list(self):
        today = datetime.now(self.settings.timezone).replace(hour=0, minute=0, second=0,
            microsecond=0).astimezone(UTC).replace(tzinfo=None)
        with self.factory() as session:
            scopes = repository.mutes(session)
            rows = repository.listing(session)
            previews = repository.source_previews(session, rows)
            file_targets = repository.file_targets(session, rows)
            items = []
            for row in rows:
                kind = row.event_key.partition(":")[0]
                muted = row.muted or "all" in scopes or f"kind:{kind}" in scopes or f"course:{row.course_id}" in scopes
                url = "/mail" if kind == "mail" else "/study" if kind == "cards" else "/deadlines" if kind in {"deadline", "assignment"} else f"/courses/{row.course_id}" if row.course_id else "/activity" if kind in {"material", "new-files"} else "/system"
                if kind in {"material", "new-files"}:
                    files = file_targets.get(row.event_key, [])
                    if len(files) == 1:
                        url = f"/material/{files[0][0]}"
                    elif files and len({course_id for _, course_id in files}) == 1 and files[0][1] is not None:
                        url = f"/courses/{files[0][1]}"
                    else:
                        url = f"/courses/{row.course_id}" if row.course_id else "/courses"
                items.append(NotificationView(id=row.id, title=row.title, body=previews.get(row.event_key, row.body), kind=kind,
                    course_id=row.course_id, created_at=row.created_at, read_at=row.read_at, muted=muted, url=url))
            return CenterView(items=items, unread=repository.unread_count(session, scopes),
                              muted_scopes=sorted(scopes), courses=[{"id": row.id, "name": row.name} for row in repository.courses(session)],
                              latest_id=repository.latest_identifier(session),
                              seen_material_changes=repository.seen_material_changes(session, today))

    def mark_all_read(self, through_id: int):
        self.coordinator.assert_writer()
        with self.factory() as session:
            repository.mark_read_through(session, through_id, utc_now())
            self.coordinator.assert_writer()
            repository.commit(session)
        return self.list()

    def update(self, identifier, read, muted):
        self.coordinator.assert_writer()
        with self.factory() as session:
            row = repository.get(session, identifier)
            if row is None:
                raise HTTPException(404, "Benachrichtigung nicht gefunden")
            if read is not None:
                row.read_at = utc_now() if read else None
            if muted is not None:
                row.muted = muted
            self.coordinator.assert_writer()
            repository.commit(session)

    def mute(self, scope, enabled):
        self.coordinator.assert_writer()
        with self.factory() as session:
            if scope.startswith("course:"):
                value = scope.removeprefix("course:")
                if not value.isdecimal() or int(value) not in {row.id for row in repository.courses(session)}:
                    raise HTTPException(404, "Kurs nicht gefunden")
            elif scope not in {"all", *("kind:" + kind for kind in ["new-files", "material", "assignment", "deadline", "connector", "mail", "cards"])}:
                raise HTTPException(400, "Unbekannter Benachrichtigungsbereich")
            repository.set_mute(session, scope, enabled)
            self.coordinator.assert_writer()
            repository.commit(session)

    def refresh(self):
        """Only stored observations; no mail/Moodle/remote lookup, no invented deadlines."""
        self.coordinator.assert_writer()
        cards = due_cards(self.settings)
        with self.factory() as session:
            for version, resource in repository.materials(session):
                Notifier.enqueue(session, f"material:{version.id}", resource.name, "Neue Materialversion",
                                 course_id=resource.course_id, read_at=version.first_opened_at, created_at=version.downloaded_at)
            for mail in repository.mail(session):
                Notifier.enqueue(session, f"mail:{mail.id}", "Neue Uni-Mail", mail.subject, created_at=mail.imported_at)
            if cards:
                Notifier.enqueue(session, f"cards:{utc_now():%Y-%m-%d}", "Lernkarten fällig", f"{len(cards)} Karten in der aktuellen Lernwarteschlange")
            self.coordinator.assert_writer()
            repository.commit(session)
        return self.list()
