# SPDX-License-Identifier: AGPL-3.0-or-later

from sqlalchemy import String, cast, exists, func, select, update

from app.db.models import (
    Assignment,
    Change,
    Course,
    MailItem,
    Notification,
    NotificationMute,
    Resource,
    ResourceVersion,
)


def listing(session):
    return session.scalars(select(Notification).order_by(Notification.created_at.desc(), Notification.id.desc()).limit(200)).all()


def mutes(session):
    return {row.scope for row in session.scalars(select(NotificationMute).where(NotificationMute.enabled.is_(True)))}


def muted(session, item):
    scopes = mutes(session)
    return item.muted or "all" in scopes or "kind:" + item.event_key.partition(":")[0] in scopes or f"course:{item.course_id}" in scopes


def courses(session):
    return session.scalars(select(Course).order_by(Course.name)).all()


def materials(session):
    return session.execute(select(ResourceVersion, Resource).join(Resource, Resource.id == ResourceVersion.resource_id)
                           .where(Resource.group_category != "other_group", Resource.removed_upstream.is_(False))
                           .order_by(ResourceVersion.downloaded_at.desc()).limit(100)).all()


def mail(session):
    return session.scalars(select(MailItem).order_by(MailItem.imported_at.desc()).limit(50)).all()


def get(session, identifier):
    return session.get(Notification, identifier)


def set_mute(session, scope, enabled):
    row = session.get(NotificationMute, scope)
    if row is None:
        session.add(NotificationMute(scope=scope, enabled=enabled))
    else:
        row.enabled = enabled


def commit(session):
    session.commit()


def unread_count(session, scopes):
    query = select(func.count(Notification.id)).where(Notification.read_at.is_(None), Notification.muted.is_(False))
    if "all" in scopes:
        return 0
    for scope in scopes:
        if scope.startswith("course:"):
            query = query.where((Notification.course_id != int(scope[7:])) | Notification.course_id.is_(None))
        elif scope.startswith("kind:"):
            query = query.where(~Notification.event_key.startswith(scope[5:] + ":", autoescape=True))
    return session.scalar(query) or 0


def latest_identifier(session):
    return session.scalar(select(func.max(Notification.id))) or 0


def mark_read_through(session, identifier, timestamp):
    session.execute(update(Notification).where(Notification.id <= identifier,
                    Notification.read_at.is_(None)).values(read_at=timestamp))


def source_previews(session, notifications):
    """Batch-load short source labels, never file contents or portal data."""
    previews = {}
    keys = [row.event_key for row in notifications]
    assignment_key = "assignment:" + Assignment.source + ":" + Assignment.source_key
    for key, title in session.execute(select(assignment_key, Assignment.title).where(assignment_key.in_(keys))):
        previews[key] = title
    run_ids = [int(row.event_key.partition(":")[2]) for row in notifications
               if row.event_key.startswith("new-files:") and row.event_key.partition(":")[2].isdecimal()]
    if run_ids:
        ranked = select(Change.sync_run_id, Change.summary,
            func.row_number().over(partition_by=Change.sync_run_id, order_by=Change.id.desc()).label("position"))\
            .where(Change.sync_run_id.in_(run_ids), Change.kind == "new").subquery()
        for identifier, summary in session.execute(select(ranked.c.sync_run_id, ranked.c.summary)
                .where(ranked.c.position <= 2).order_by(ranked.c.sync_run_id, ranked.c.position)):
            key = f"new-files:{identifier}"
            previews[key] = " · ".join(filter(None, [previews.get(key), summary]))
    return previews


def file_targets(session, notifications):
    """Batch-load existing file handles for individual and sync notifications."""
    version_ids, run_ids = [], []
    for row in notifications:
        kind, _, identifier = row.event_key.partition(":")
        if identifier.isdecimal():
            if kind == "material":
                version_ids.append(int(identifier))
            elif kind == "new-files":
                run_ids.append(int(identifier))
    targets = {}
    visible = (Resource.group_category != "other_group", Resource.removed_upstream.is_(False))
    if version_ids:
        for version_id, course_id in session.execute(select(ResourceVersion.id, Resource.course_id)
                .join(Resource, Resource.id == ResourceVersion.resource_id)
                .where(ResourceVersion.id.in_(version_ids), *visible)):
            targets[f"material:{version_id}"] = [(version_id, course_id)]
    if run_ids:
        latest = select(ResourceVersion.resource_id, func.max(ResourceVersion.version).label("version"))\
            .group_by(ResourceVersion.resource_id).subquery()
        rows = session.execute(select(Change.sync_run_id, ResourceVersion.id, Resource.course_id)
            .join(Resource, Resource.id == Change.resource_id)
            .join(latest, latest.c.resource_id == Resource.id)
            .join(ResourceVersion, (ResourceVersion.resource_id == Resource.id) &
                  (ResourceVersion.version == latest.c.version))
            .where(Change.sync_run_id.in_(run_ids), Change.kind == "new", *visible).distinct()).all()
        for run_id, version_id, course_id in rows:
            targets.setdefault(f"new-files:{run_id}", []).append((version_id, course_id))
    return targets


def seen_material_changes(session, since):
    """Resolve stored read states without conflating notification and change IDs."""
    read_run = exists(select(Notification.id).where(
        Notification.event_key == "new-files:" + cast(Change.sync_run_id, String),
        Notification.read_at.is_not(None)))
    read_material = exists(select(ResourceVersion.id).join(Notification,
        Notification.event_key == "material:" + cast(ResourceVersion.id, String)).where(
            ResourceVersion.resource_id == Change.resource_id, Notification.read_at.is_not(None)))
    recent = select(Change.id).outerjoin(Resource, Change.resource_id == Resource.id).outerjoin(
        Course, Change.course_id == Course.id).where(
            Change.kind == "new", Change.created_at >= since,
            Change.course_id.is_(None) | Course.is_active.is_(True),
            Change.resource_id.is_(None) | (Resource.group_category != "other_group"),
        ).order_by(Change.created_at.desc()).limit(20).correlate(None)
    return list(session.scalars(select(Change.id).where(Change.id.in_(recent), read_run | read_material)))
