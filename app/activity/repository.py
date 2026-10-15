# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read existing, timestamped facts without duplicating personal records."""

from datetime import datetime
from typing import NamedTuple

from sqlalchemy import and_, or_, select

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Assignment,
    Change,
    Course,
    Exam,
    ExamRegistration,
    Exercise,
    ExerciseAttempt,
    Grade,
    IntakeDecision,
    LearningTopic,
    LinkEdge,
    LocalAction,
    MaterialAnnotation,
    Note,
    NoteVersion,
    ObjectMetadata,
    Project,
    RepoSnapshot,
    Resource,
    ResourceVersion,
    SubmissionAttempt,
)


class Fact(NamedTuple):
    at: datetime
    kind: str
    subject: str
    source: str


class ActivityRepository:
    def __init__(self, factory):
        self.factory = factory

    def facts(self, kind: str, entity_id: str) -> list[Fact] | None:
        with self.factory() as session:
            numeric = int(entity_id) if kind != "note" else None
            model = {"course": Course, "material": Resource, "assignment": Assignment,
                     "note": Note, "exam": Exam, "project": Project, "topic": LearningTopic}[kind]
            entity = session.get(model, entity_id if numeric is None else numeric)
            if entity is None:
                return None
            if isinstance(entity, Resource) and entity.group_category == "other_group":
                return None
            facts: list[Fact] = []
            course_id = numeric if kind == "course" else getattr(entity, "course_id", None)

            if kind != "course":
                metadata = session.scalar(select(ObjectMetadata).where(
                    ObjectMetadata.object_type == kind, ObjectMetadata.object_id == entity_id))
                if metadata is not None:
                    facts.append(Fact(metadata.updated_at, "metadata", "Aktueller Stand der Eigenschaften",
                                      "Lokale Eigenschaften"))

            intake_query = select(IntakeDecision)
            if kind == "course":
                intake_query = intake_query.where(IntakeDecision.course_id == numeric)
            else:
                intake_query = intake_query.where(IntakeDecision.target_kind == kind,
                                                  IntakeDecision.target_id == entity_id)
            state_labels = {"review": "zur Prüfung vorgemerkt", "accepted": "angenommen",
                            "rejected": "abgelehnt", "snoozed": "verschoben",
                            "duplicate": "als Duplikat markiert"}
            source_labels = {"clip": "Web-/Textclip", "voice": "Sprachnotiz", "jot": "Schnellerfassung",
                             "mail": "Uni-Mail", "material": "Moodle-Material", "assignment": "Moodle-Aufgabe",
                             "file": "Eigene Datei"}
            for decision in session.scalars(intake_query.order_by(IntakeDecision.updated_at.desc()).limit(60)):
                label = state_labels.get(decision.state)
                if label:
                    facts.append(Fact(decision.updated_at, "intake", f"{source_labels.get(decision.source_kind, 'Quelle')} {label}",
                                      "Eingang · aktueller Entscheidungsstand"))

            if kind in {"course", "material", "assignment"}:
                changes_query = select(Change)
                if kind == "course":
                    changes_query = changes_query.where(Change.course_id == numeric)
                elif kind == "material":
                    changes_query = changes_query.where(Change.resource_id == numeric)
                else:
                    changes_query = changes_query.where(Change.assignment_id == numeric)
                for row in session.scalars(changes_query.order_by(Change.created_at.desc()).limit(60)):
                    facts.append(Fact(row.created_at, "change", row.summary,
                                      "Moodle-Sync" if row.sync_run_id else "Lokale Änderung"))

            if kind in {"course", "material"}:
                versions_query = select(ResourceVersion, Resource).join(Resource, Resource.id == ResourceVersion.resource_id)
                versions_query = versions_query.where(Resource.course_id == course_id) if kind == "course" else versions_query.where(Resource.id == numeric)
                for version, resource in session.execute(versions_query.order_by(ResourceVersion.downloaded_at.desc()).limit(60)):
                    facts.append(Fact(version.downloaded_at, "material_version",
                                      f"{resource.name} · Version {version.version}", resource.source))

            if kind == "material":
                for row in session.scalars(select(MaterialAnnotation).where(MaterialAnnotation.resource_id == numeric)
                                           .order_by(MaterialAnnotation.created_at.desc()).limit(60)):
                    facts.append(Fact(row.created_at, "annotation", f"Seite {row.source_page} · {row.kind}",
                                      "Lokale Markierung"))

            if kind in {"course", "note"}:
                notes_query = select(NoteVersion, Note).join(Note, Note.id == NoteVersion.note_id)
                notes_query = notes_query.where(Note.course_id == course_id) if kind == "course" else notes_query.where(Note.id == entity_id)
                for version, note in session.execute(notes_query.order_by(NoteVersion.created_at.desc()).limit(60)):
                    facts.append(Fact(version.created_at, "note_version", f"{note.title} · Version {version.revision}",
                                      "Lokale Notiz"))

            if kind in {"course", "assignment"}:
                submissions_query = select(SubmissionAttempt, Assignment).join(Assignment, Assignment.id == SubmissionAttempt.assignment_id)
                submissions_query = submissions_query.where(Assignment.course_id == course_id) if kind == "course" else submissions_query.where(Assignment.id == numeric)
                for attempt, assignment in session.execute(submissions_query.order_by(SubmissionAttempt.created_at.desc()).limit(60)):
                    facts.append(Fact(attempt.created_at, "submission", f"{assignment.title} · {attempt.state}",
                                      "Lokaler Abgabeversuch"))

            if kind in {"course", "exam"}:
                registration = select(ExamRegistration, Exam).join(Exam, Exam.id == ExamRegistration.exam_id)
                registration = registration.where(Exam.course_id == course_id) if kind == "course" else registration.where(Exam.id == numeric)
                for row, exam in session.execute(registration.order_by(ExamRegistration.checked_at.desc()).limit(60)):
                    facts.append(Fact(row.checked_at, "registration", f"{exam.title} · {row.status}",
                                      "Gespeicherte Portalprüfung"))
                grades = select(Grade, Exam).join(Exam, Exam.id == Grade.exam_id)
                grades = grades.where(Exam.course_id == course_id) if kind == "course" else grades.where(Exam.id == numeric)
                for row, exam in session.execute(grades.order_by(Grade.checked_at.desc()).limit(60)):
                    facts.append(Fact(row.checked_at, "grade", f"{exam.title} · {row.value}",
                                      "Gespeicherter Notenwert"))

            if kind in {"course", "project"}:
                projects = session.scalars(select(Project).where(Project.course_id == course_id) if kind == "course"
                                           else select(Project).where(Project.id == numeric)).all()
                for project in projects:
                    facts.append(Fact(project.created_at, "project_created", project.name, "Lokales Projekt"))
                    if project.revision > 1:
                        facts.append(Fact(project.updated_at, "project_updated", project.name, "Lokales Projekt"))
                snapshot = select(RepoSnapshot, Project).join(Project, Project.id == RepoSnapshot.project_id)
                snapshot = snapshot.where(Project.course_id == course_id) if kind == "course" else snapshot.where(Project.id == numeric)
                for row, project in session.execute(snapshot.order_by(RepoSnapshot.fetched_at.desc()).limit(60)):
                    facts.append(Fact(row.fetched_at, "repo_snapshot", project.name, "Lokaler Git-Spiegel"))

            if kind in {"course", "topic"}:
                reviews = (select(AnkiReview, LearningTopic)
                           .join(AnkiCard, AnkiCard.id == AnkiReview.card_id)
                           .join(AnkiCardQueue, AnkiCardQueue.id == AnkiCard.queue_id)
                           .join(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id))
                reviews = reviews.where(LearningTopic.course_id == course_id) if kind == "course" else reviews.where(LearningTopic.id == numeric)
                for row, topic in session.execute(reviews.order_by(AnkiReview.reviewed_at.desc()).limit(60)):
                    facts.append(Fact(row.reviewed_at, "anki_review", topic.name, "Anki-Wiederholung"))
                attempts = (select(ExerciseAttempt, LearningTopic)
                            .join(Exercise, Exercise.id == ExerciseAttempt.exercise_id)
                            .join(LearningTopic, LearningTopic.id == Exercise.topic_id))
                attempts = attempts.where(LearningTopic.course_id == course_id) if kind == "course" else attempts.where(LearningTopic.id == numeric)
                for row, topic in session.execute(attempts.order_by(ExerciseAttempt.attempted_at.desc()).limit(60)):
                    facts.append(Fact(row.attempted_at, "exercise", topic.name, "Lokale Übung"))

            relation_kind = "resource" if kind == "material" else kind
            if kind != "course":
                for edge in session.scalars(select(LinkEdge).where(or_(
                        and_(LinkEdge.from_type == relation_kind, LinkEdge.from_id == entity_id),
                        and_(LinkEdge.to_type == relation_kind, LinkEdge.to_id == entity_id))).limit(60)):
                    facts.append(Fact(edge.created_at, "relation_created", edge.relation, "Lokale Verknüpfung"))
            local_query = select(LocalAction).where(LocalAction.course_id == course_id) if kind == "course" else select(LocalAction).where(or_(
                and_(LocalAction.kind.in_([kind, "topic_merge"] if kind == "topic" else [kind]), LocalAction.entity_id == entity_id),
                and_(LocalAction.kind == "relation", or_(
                    and_(LocalAction.before["from_type"].as_string() == relation_kind, LocalAction.before["from_id"].as_string() == entity_id),
                    and_(LocalAction.before["to_type"].as_string() == relation_kind, LocalAction.before["to_id"].as_string() == entity_id)))))
            for action in session.scalars(local_query.order_by(LocalAction.created_at.desc()).limit(60)):
                if action.kind == "intake":
                    facts.append(Fact(action.created_at, "intake_change", "Entscheidung geändert", "Lokale Änderung"))
                if action.kind == "topic_merge":
                    facts.append(Fact(action.created_at, "topic_merge", "Lernthemen zusammengeführt", "Lokale Änderung"))
                if action.kind == "relation":
                    facts.append(Fact(action.created_at, "relation_removed", action.before["relation"], "Lokale Verknüpfung"))
                if action.undone_at:
                    facts.append(Fact(action.undone_at, "undo", "Vorherigen Zustand als neue Version wiederhergestellt", "Lokale Änderung"))
            return facts
