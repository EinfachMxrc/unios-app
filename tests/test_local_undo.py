# SPDX-License-Identifier: AGPL-3.0-or-later

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.db.models import (
    Course,
    Exercise,
    InboxClip,
    IntakeDecision,
    LearningTopic,
    Note,
)
from app.entities.schema import EntityRef
from app.intake.repository import IntakeRepository
from app.intake.service import IntakeService
from app.links.service import create, unlink
from app.local_actions.service import LocalActions
from app.notes.store import create_note, read_note, update_note


def test_undo_note_is_a_new_revision_and_refuses_stale_changes(settings, factory, coordinator):
    actions = LocalActions(factory, settings, coordinator)
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED,title,body)"))
        course = Course(source="fixture", source_id="undo", name="Fiktiver Kurs")
        session.add(course); session.flush()
        note = create_note(session, settings, course_id=course.id, resource_id=None, title="Notiz", body="Erste Fassung")
        identifier = note.id
        update_note(session, settings, identifier, expected_revision=1, title="Notiz", body="Zweite Fassung")
    first = actions.recent(kind="note")[0]
    assert first.undoable
    actions.undo(first.id)
    with factory() as session:
        note, _, body, versions = read_note(session, settings, identifier)
        assert note.current_revision == 3 and body == "Erste Fassung" and len(versions) == 3
        assert session.get(Note, identifier)
    with pytest.raises(HTTPException) as conflict:
        actions.undo(first.id)
    assert conflict.value.status_code == 409


def test_undo_intake_preserves_revision_and_blocks_unrelated_edits(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="intake-undo", name="Fach")
        session.add(course); session.flush()
        session.add(InboxClip(id="fictional", kind="text", title="Gedanke", body="Text"))
        session.commit(); course_id = course.id
    service = IntakeService(IntakeRepository(factory, settings))
    service.update("clip", "fictional", 0, "accepted", course_id, None, None, None, None)
    actions = LocalActions(factory, settings, coordinator)
    action = actions.recent(kind="intake")[0]
    actions.undo(action.id)
    with factory() as session:
        clip = session.get(InboxClip, "fictional")
        assert not clip.filed and clip.course_id is None
        assert session.query(IntakeDecision).one().revision == 2
    service.update("clip", "fictional", 2, "accepted", course_id, None, None, None, None)
    pending = actions.recent(kind="intake")[0]
    with factory() as session:
        session.get(InboxClip, "fictional").revision += 1
        session.commit()
    with pytest.raises(HTTPException):
        actions.undo(pending.id)


def test_removed_relationship_can_be_restored_once(settings, factory, coordinator):
    with factory() as session:
        for identifier in ("a", "b"):
            session.add(Course(source="fixture", source_id=identifier, name=identifier))
        session.commit()
        ids = [row.id for row in session.query(Course).all()]
        edge = create(session, EntityRef(type="course", id=str(ids[0])), EntityRef(type="course", id=str(ids[1])), "related")
        unlink(session, edge.id)
    actions = LocalActions(factory, settings, coordinator)
    entry = actions.recent(kind="relation")[0]
    from app.activity.repository import ActivityRepository
    from app.activity.service import ActivityService

    history = ActivityService(ActivityRepository(factory))
    assert any(item.title == "Verknüpfung entfernt" for item in history.list("course", str(ids[0])))
    actions.undo(entry.id)
    assert not actions.recent(kind="relation")[0].undoable


def test_topic_merge_undo_preserves_references_and_refuses_new_work(settings, factory, coordinator):
    from app.learning.merge import merge_topics

    with factory() as session:
        course = Course(source="fixture", source_id="topic-undo", name="Fach")
        session.add(course); session.flush()
        source = LearningTopic(course_id=course.id, slug="while", name="While")
        target = LearningTopic(course_id=course.id, slug="loops", name="Schleifen")
        session.add_all([source, target]); session.flush()
        exercise = Exercise(topic_id=source.id, question="Frage", solution="Antwort")
        session.add(exercise); session.commit()
        source_id, target_id, exercise_id = source.id, target.id, exercise.id
        merge_topics(session, source_id, target_id, coordinator.assert_writer)
    actions = LocalActions(factory, settings, coordinator)
    entry = actions.recent(kind="topic_merge")[0]
    assert entry.undoable
    from app.activity.repository import ActivityRepository
    from app.activity.service import ActivityService

    assert any(item.title == "Lernthemen zusammengeführt" for item in
               ActivityService(ActivityRepository(factory)).list("topic", str(target_id)))
    actions.undo(entry.id)
    with factory() as session:
        assert session.get(LearningTopic, source_id).name == "While"
        assert session.get(Exercise, exercise_id).topic_id == source_id
        merge_topics(session, source_id, target_id, coordinator.assert_writer)
        session.get(Exercise, exercise_id).question = "Später geändert"
        session.commit()
    stale = actions.recent(kind="topic_merge")[0]
    assert not stale.undoable
    with pytest.raises(HTTPException):
        actions.undo(stale.id)


def test_topic_merge_undo_restores_conflicts_and_blocks_new_reviews(settings, factory, coordinator):
    from app.db.models import (
        Exam,
        ExerciseAttempt,
        LinkEdge,
        ObjectMetadata,
        StudyBlockSuggestion,
        utc_now,
    )
    from app.learning.merge import merge_topics

    with factory() as session:
        course = Course(source="fixture", source_id="merge-conflicts", name="Fach")
        session.add(course); session.flush()
        topics = [LearningTopic(course_id=course.id, slug=name, name=name) for name in ("Quelle", "Ziel")]
        exam = Exam(course_id=course.id, source_key="fixture-exam", title="Prüfung")
        session.add_all([*topics, exam]); session.flush()
        ids = [topic.id for topic in topics]
        session.add(LinkEdge(from_type="topic", from_id=str(ids[0]), to_type="course",
                             to_id=str(course.id), relation="part_of"))
        for index, topic in enumerate(topics):
            session.add(ObjectMetadata(object_type="topic", object_id=str(topic.id), tags=[topic.name]))
            session.add(StudyBlockSuggestion(exam_id=exam.id, topic_id=topic.id,
                                            duration_minutes=25, starts_at=utc_now(),
                                            status="accepted" if index == 0 else "proposed"))
        exercise = Exercise(topic_id=ids[0], question="Frage", solution="Antwort")
        session.add(exercise); session.commit(); exercise_id = exercise.id
        merge_topics(session, *ids, coordinator.assert_writer)
        assert session.query(LinkEdge).one().from_id == str(ids[1])
    actions = LocalActions(factory, settings, coordinator)
    actions.undo(actions.recent(kind="topic_merge")[0].id)
    with factory() as session:
        metadata = session.query(ObjectMetadata).all()
        assert {row.object_id: row.tags for row in metadata} == {str(ids[0]): ["Quelle"], str(ids[1]): ["Ziel"]}
        assert all(row.revision >= 2 for row in metadata)
        assert len(session.query(StudyBlockSuggestion).all()) == 2
        assert session.query(LinkEdge).one().from_id == str(ids[0])
        merge_topics(session, *ids, coordinator.assert_writer)
        session.add(ExerciseAttempt(exercise_id=exercise_id, answer="Neue Antwort", correct=True))
        session.commit()
    entry = actions.recent(kind="topic_merge")[0]
    assert not entry.undoable
    with pytest.raises(HTTPException):
        actions.undo(entry.id)
