# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from app.collections import repository
from app.collections.cards import due_cards
from app.collections.schema import (
    SOURCE_KINDS,
    AnyGroup,
    CollectionConfig,
    CollectionItem,
    CollectionResult,
    CollectionView,
)
from app.config import Settings
from app.db.models import (
    SmartCollection,
    utc_now,
)
from app.learning.progress import progress_for_topics
from app.submissions.service import latest_check
from app.timeutil import as_utc


def _config(item: SmartCollection) -> CollectionConfig:
    return CollectionConfig.model_validate({
        "kind": item.kind, "view": item.view, "course_id": item.course_id,
        "days": item.days, "max_percent": item.max_percent,
        "own_group_only": item.own_group_only,
        "include_unmeasured": item.include_unmeasured, "sort": item.sort,
        "tag": item.tag, "priority": item.priority, "exam_relevant": item.exam_relevant,
        "difficulty": item.difficulty, "workflow_status": item.workflow_status,
        "group_by": item.group_by, "any_groups": item.any_groups,
        **(item.options or {}),
    })


def _view(item: SmartCollection) -> CollectionView:
    return CollectionView(id=item.id, name=item.name, config=_config(item), revision=item.revision)


def _apply(item: SmartCollection, name: str, config: CollectionConfig) -> None:
    item.name = name.strip()
    item.kind = config.kind
    item.view = config.view
    item.course_id = config.course_id
    item.days = config.days
    item.max_percent = config.max_percent
    item.own_group_only = config.own_group_only
    item.include_unmeasured = config.include_unmeasured
    item.sort = config.sort
    item.tag = config.tag
    item.priority = config.priority
    item.exam_relevant = config.exam_relevant
    item.difficulty = config.difficulty
    item.workflow_status = config.workflow_status
    item.group_by = config.group_by
    item.any_groups = [group.model_dump(exclude_none=True) for group in config.any_groups]
    item.options = config.model_dump(include={"sort_direction", "visible_fields", "time_filter",
                                             "unread_only", "has_questions", "submission_filter"})
    item.updated_at = utc_now()


def _results(session, settings: Settings, config: CollectionConfig, limit: int | None = 200) -> CollectionResult:
    now = datetime.now(UTC)
    if config.kind == "all":
        combined: list[CollectionItem] = []
        for kind in SOURCE_KINDS:
            child = config.model_copy(update={
                "kind": kind, "view": "list", "sort": "date", "any_groups": [],
                "days": None if kind == "topics" else config.days,
                "max_percent": config.max_percent if kind == "topics" else None,
                "own_group_only": config.own_group_only if kind == "materials" else False,
                "unread_only": config.unread_only if kind == "materials" else False,
                "has_questions": config.has_questions if kind == "materials" else False,
                "time_filter": config.time_filter if kind == "deadlines" else "all",
                "submission_filter": config.submission_filter if kind == "deadlines" else "all",
            })
            combined.extend(_results(session, settings, child, limit=None).items)
        if config.any_groups:
            combined = [item for item in combined if any(_matches(item, group) for group in config.any_groups)]
        _sort_items(combined, config)
        return CollectionResult(items=combined[:limit] if limit is not None else combined, total=len(combined))
    items: list[CollectionItem] = []
    if config.kind == "topics":
        rows = repository.view_rows(session, config, now)
        progresses = progress_for_topics(session, settings, [topic for topic, _ in rows])
        for (topic, course), progress in zip(rows, progresses, strict=True):
            values = [round(value * 100) for value in (progress.anki_retention, progress.exercise_accuracy)
                      if value is not None]
            score = min(values) if values else None
            if score is None and not config.include_unmeasured:
                continue
            if config.max_percent is not None and score is not None and score > config.max_percent:
                continue
            status = "Zu wenig Daten" if score is None else "Nacharbeiten" if score < 70 else "Im Plan"
            items.append(CollectionItem(id=str(topic.id), title=topic.name, subtitle=(
                f"{progress.anki_review_count} Anki-Reviews · {progress.exercise_attempt_count} Übungsversuche"),
                course_name=course.name, course_id=course.id, url=f"/learning?topic={topic.id}",
                date=None, score=score, status=status))
    elif config.kind == "cards":
        courses = {course.name: course for course in repository.courses(session)}
        for card in due_cards(settings):
            course = courses.get(card["course"])
            if config.course_id is not None and (course is None or course.id != config.course_id):
                continue
            items.append(CollectionItem(id=str(card["id"]), title=card["front"][:180], subtitle=card["deck"],
                course_name=course.name if course else card["course"], course_id=course.id if course else None,
                url="/study?deck=" + quote(card["deck"], safe=""), date=datetime.fromisoformat(card["fsrs"]["due"]),
                score=None, status="Fällig", source="anki"))
    elif config.kind == "notes":
        for note, course in repository.view_rows(session, config, now):
            items.append(CollectionItem(id=note.id, title=note.title,
                subtitle=f"Version {note.current_revision}", course_name=course.name if course else None,
                course_id=course.id if course else None,
                url=f"/notes?id={note.id}", date=as_utc(note.updated_at), score=None, status="Notiz"))
    elif config.kind == "materials":
        for version, resource, course in repository.view_rows(session, config, now):
            items.append(CollectionItem(id=str(resource.id), title=resource.name,
                subtitle=f"Version {version.version} · {version.mime_type}", course_name=course.name,
                course_id=course.id,
                url=f"/material/{version.id}", date=as_utc(version.downloaded_at), score=None,
                status="Eigene Gruppe" if resource.group_category == "own_group" else "Allgemein",
                source=resource.source, own_group=resource.group_category == "own_group"))
    elif config.kind == "deadlines":
        for deadline, course in repository.view_rows(session, config, now):
            if config.submission_filter == "unsubmitted":
                if deadline.assignment_id is None:
                    continue
                check = latest_check(settings, deadline.assignment_id)
                # Missing or unclear checks never mean "not submitted".
                if check is None or check.status not in {"none", "draft"}:
                    continue
            due = as_utc(deadline.due_at)
            status = "Überfällig" if due < now else "Bald" if due < now + timedelta(days=3) else "Anstehend"
            items.append(CollectionItem(id=str(deadline.id), title=deadline.title,
                subtitle=f"Fällig am {due.astimezone(settings.timezone):%d.%m.%Y}",
                course_name=course.name if course else None, course_id=course.id if course else None,
                url="/deadlines", date=due,
                score=None, status=status, source=deadline.source))
    else:
        for question, resource, course in repository.view_rows(session, config, now):
            items.append(CollectionItem(id=question.id, title=(question.comment or question.quote)[:180],
                subtitle=f"{resource.name} · Seite {question.source_page}", course_name=course.name,
                course_id=course.id,
                url=f"/material/{question.source_version_id}#annotation-{question.id}",
                date=as_utc(question.created_at), score=None, status="Offen"))
    metadata_kind = {"topics": "topic", "materials": "material", "deadlines": "deadline",
                     "questions": "question", "notes": "note", "cards": "card"}[config.kind]
    metadata = {row.object_id: row for row in repository.metadata(session, metadata_kind)}
    filtered: list[CollectionItem] = []
    for item in items:
        item.kind = config.kind  # type: ignore[assignment]  # "all" returned above
        details = metadata.get(item.id)
        if config.tag and (details is None or config.tag.casefold().lstrip("#") not in details.tags):
            continue
        if config.priority and (details is None or details.priority != config.priority):
            continue
        if config.exam_relevant is not None and (details is None or details.exam_relevant != config.exam_relevant):
            continue
        if config.difficulty and (details is None or details.difficulty != config.difficulty):
            continue
        if config.workflow_status and (details is None or details.workflow_status != config.workflow_status):
            continue
        if details:
            item.tags = details.tags
            item.priority = details.priority
            item.exam_relevant = details.exam_relevant
            if details.workflow_status:
                item.status = {"open": "Offen", "working": "In Arbeit", "done": "Erledigt"}[details.workflow_status]
        filtered.append(item)
    items = filtered
    if config.any_groups:
        items = [item for item in items if any(_matches(item, group) for group in config.any_groups)]
    _sort_items(items, config)
    return CollectionResult(items=items[:limit] if limit is not None else items, total=len(items))


def _matches(item: CollectionItem, group: AnyGroup) -> bool:
    return ((group.kind is None or group.kind == item.kind)
            and (group.course_id is None or group.course_id == item.course_id)
            and (group.status is None or group.status.casefold() == item.status.casefold())
            and (group.source is None or group.source.casefold() == item.source.casefold())
            and (group.tag is None or group.tag.casefold().lstrip("#") in [tag.casefold() for tag in item.tags])
            and (group.max_percent is None or item.score is not None and item.score <= group.max_percent)
            and (not group.own_group_only or item.kind == "materials" and item.own_group))


def _sort_items(items: list[CollectionItem], config: CollectionConfig) -> None:
    if config.sort == "title":
        items.sort(key=lambda item: (item.title.casefold(), item.id))
    elif config.sort == "progress":
        items.sort(key=lambda item: (item.score is None, item.score if item.score is not None else 101,
                                     item.title.casefold()))
    else:
        direction = (1 if config.kind == "deadlines" else -1) if config.sort_direction == "auto" else (1 if config.sort_direction == "asc" else -1)
        items.sort(key=lambda item: (item.date is None, direction * (item.date.timestamp() if item.date else 0),
                                     item.title.casefold()))
    if config.sort != "date" and config.sort_direction == "desc":
        measured = [item for item in items if config.sort != "progress" or item.score is not None]
        unknown = [item for item in items if config.sort == "progress" and item.score is None]
        items[:] = list(reversed(measured)) + unknown


