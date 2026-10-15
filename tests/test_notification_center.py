# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import (
    Assignment,
    Change,
    Course,
    Notification,
    Resource,
    ResourceVersion,
    SyncRun,
    utc_now,
)
from app.notify.api import notification_router
from app.notify.center import NotificationCenter
from app.notify.service import Notifier


def test_read_unread_course_mute_and_repeat_are_persistent(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="notifications", name="Fiktiver Kurs")
        session.add(course); session.flush()
        course_id = course.id
        notification = Notifier.enqueue(session, "material:fixture", "Ein neues Skript", "Unterlage", course_id=course.id)
        session.commit(); identifier = notification.id
    center = NotificationCenter(factory, settings, coordinator)
    assert center.list().unread == 1
    center.update(identifier, True, None)
    assert center.list().unread == 0
    center.update(identifier, False, None)
    center.mute(f"course:{course_id}", True)
    assert center.list().items[0].muted and center.list().unread == 0
    center.mute(f"course:{course_id}", False)
    center.update(identifier, None, True)
    with factory() as session:
        same = Notifier.enqueue(session, "material:fixture", "Ein neues Skript", "Unterlage", course_id=course_id)
        assert same.id == identifier and same.muted


def test_mark_all_covers_listing_limit_and_preserves_new_arrivals(settings, factory, coordinator):
    original_read_at = utc_now() - timedelta(hours=1)
    with factory() as session:
        session.add_all([Notification(event_key=f"fixture:{i}", title=f"Meldung {i}", body="Kurzinfo")
                         for i in range(251)])
        session.flush()
        first = session.scalar(select(Notification).order_by(Notification.id))
        assert first is not None
        first.read_at = original_read_at
        session.commit()
        first_id = first.id
    center = NotificationCenter(factory, settings, coordinator)
    captured = center.list()
    assert len(captured.items) == 200 and captured.unread == 250
    with factory() as session:
        late = Notifier.enqueue(session, "fixture:late", "Später eingetroffen", "Bleibt neu")
        session.commit()
        late_id = late.id
    result = center.mark_all_read(captured.latest_id)
    assert result.unread == 1 and result.latest_id == late_id
    with factory() as session:
        assert session.scalar(select(Notification.id).where(Notification.read_at.is_(None))) == late_id
        assert session.get(Notification, first_id).read_at == original_read_at.replace(tzinfo=None)
    center.mark_all_read(result.latest_id)
    assert center.list().unread == 0


def test_seen_documents_resolve_sync_and_resource_notifications(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="read-counter", name="Fiktiver Kurs")
        run = SyncRun()
        session.add_all([course, run]); session.flush()
        resource = Resource(source="fixture", source_key="document", course_id=course.id,
                            name="Skript", kind="file", url="")
        session.add(resource); session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, relative_path="fixture.pdf",
                                  sha256="a" * 64, size=1, mime_type="application/pdf")
        sync_change = Change(sync_run_id=run.id, course_id=course.id, kind="new", summary="Neue Unterlage")
        material_change = Change(resource_id=resource.id, course_id=course.id, kind="new", summary="Skript")
        session.add_all([version, sync_change, material_change]); session.flush()
        sync_notification = Notifier.enqueue(session, f"new-files:{run.id}", "Neue Dateien", "Kurzinfo")
        material_notification = Notifier.enqueue(session, f"material:{version.id}", "Skript", "Kurzinfo")
        session.commit()
        sync_id, material_id = sync_notification.id, material_notification.id
        sync_change_id, material_change_id = sync_change.id, material_change.id
    center = NotificationCenter(factory, settings, coordinator)
    assert center.list().seen_material_changes == []
    assert next(item for item in center.list().items if item.id == sync_id).body == "Neue Unterlage"
    center.update(sync_id, True, None)
    assert center.list().seen_material_changes == [sync_change_id]
    center.update(material_id, True, None)
    assert set(center.list().seen_material_changes) == {sync_change_id, material_change_id}
    center.update(sync_id, False, None)
    assert center.list().seen_material_changes == [material_change_id]
    # A later import has a different sync handle and stays new.
    with factory() as session:
        next_run = SyncRun(); session.add(next_run); session.flush()
        session.add(Change(sync_run_id=next_run.id, course_id=course.id, kind="new", summary="Weiteres Skript"))
        session.commit()
    assert center.list().seen_material_changes == [material_change_id]


def test_bulk_read_api_validates_boundary_and_returns_persistent_state(settings, factory, coordinator):
    with factory() as session:
        item = Notifier.enqueue(session, "fixture:api", "Hinweis", "Kurzinfo")
        session.commit(); identifier = item.id
    app = FastAPI()
    app.include_router(notification_router(NotificationCenter(factory, settings, coordinator)))
    with TestClient(app) as client:
        for payload in [{}, {"through_id": -1}, {"through_id": 2 ** 63}, {"through_id": identifier, "extra": True}]:
            assert client.post("/api/notifications/read-all", json=payload).status_code == 422
        result = client.post("/api/notifications/read-all", json={"through_id": identifier})
        assert result.status_code == 200 and result.json()["unread"] == 0
        assert client.get("/api/notifications").json()["items"][0]["read_at"] is not None


def test_previews_use_stored_source_titles_and_stay_bounded(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="previews", name="Beispielkurs")
        run = SyncRun()
        session.add_all([course, run]); session.flush()
        session.add(Assignment(source="fixture", source_key="task", course_id=course.id, title="Rekursion üben"))
        session.add_all([Change(sync_run_id=run.id, course_id=course.id, kind="new", summary=f"Skript {i}")
                         for i in range(4)])
        Notifier.enqueue(session, f"new-files:{run.id}", "Neue Unterlagen", "Allgemeiner Hinweis")
        Notifier.enqueue(session, "assignment:fixture:task", "Neue Aufgabe", "Allgemeiner Hinweis")
        Notifier.enqueue(session, "assignment:fixture:missing", "Neue Aufgabe", "Original bleibt erhalten")
        session.commit()
    items = NotificationCenter(factory, settings, coordinator).list().items
    assert [item.body for item in items] == ["Original bleibt erhalten", "Rekursion üben", "Skript 3 · Skript 2"]


def test_file_notifications_open_the_stored_file_instead_of_activity(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="direct-file", name="Fiktiver Dateikurs")
        run = SyncRun()
        session.add_all([course, run]); session.flush()
        resource = Resource(source="fixture", source_key="direct-file", course_id=course.id,
                            name="Fiktives Skript.pdf", kind="file", url="")
        session.add(resource); session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, relative_path="fixture.pdf",
                                  sha256="b" * 64, size=1, mime_type="application/pdf")
        session.add(version); session.flush()
        session.add(Change(sync_run_id=run.id, resource_id=resource.id, course_id=course.id,
                           kind="new", summary="Fiktives Skript.pdf"))
        Notifier.enqueue(session, f"material:{version.id}", "Fiktives Skript.pdf", "Neue Datei", course_id=course.id)
        Notifier.enqueue(session, f"new-files:{run.id}", "Eine neue Datei", "Neue Datei")
        session.commit()
        version_id = version.id
    items = NotificationCenter(factory, settings, coordinator).list().items
    assert len(items) == 2
    assert {item.url for item in items} == {f"/material/{version_id}"}
