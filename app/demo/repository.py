# SPDX-License-Identifier: AGPL-3.0-or-later

"""Idempotent persistence for the isolated, invented demo semester."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Assignment,
    Change,
    Course,
    CourseSection,
    Deadline,
    Exam,
    Exercise,
    Grade,
    LearningTopic,
    Notification,
    Project,
    Resource,
    ResourceText,
    ResourceVersion,
    Semester,
    StudyBlockSuggestion,
    SyncRun,
    utc_now,
)


class DemoRepository:
    def __init__(self, session: Session):
        self.session = session

    def semester(self) -> Semester:
        item = self.session.scalar(select(Semester).where(Semester.name == "Demo-Semester 1"))
        if item is None:
            item = Semester(name="Demo-Semester 1", is_current=True)
            self.session.add(item)
            self.session.flush()
        return item

    def course(self, semester_id: int, key: str, name: str) -> Course:
        item = self.session.scalar(select(Course).where(Course.source == "demo", Course.source_id == key))
        if item is None:
            item = Course(source="demo", source_id=key, name=name, short_name=name,
                          semester_id=semester_id, last_seen_at=utc_now(), download_other_groups=True)
            self.session.add(item)
            self.session.flush()
        return item

    def section(self, course_id: int, key: str, name: str) -> CourseSection:
        item = self.session.scalar(select(CourseSection).where(
            CourseSection.course_id == course_id, CourseSection.source_id == key))
        if item is None:
            item = CourseSection(course_id=course_id, source_id=key, name=name, position=1)
            self.session.add(item)
            self.session.flush()
        return item

    def resource(self, course_id: int, section_id: int, key: str, name: str) -> Resource:
        item = self.session.scalar(select(Resource).where(Resource.source == "demo", Resource.source_key == key))
        if item is None:
            item = Resource(source="demo", source_key=key, course_id=course_id, section_id=section_id,
                            kind="file", name=name, url="", last_seen_at=utc_now(), group_category="general")
            self.session.add(item)
            self.session.flush()
        return item

    def version(self, resource_id: int, relative_path: str, digest: str, size: int, body: str) -> None:
        existing = self.session.scalar(select(ResourceVersion).where(
            ResourceVersion.resource_id == resource_id, ResourceVersion.version == 1))
        if existing is not None:
            return
        version = ResourceVersion(resource_id=resource_id, version=1, sha256=digest,
                                  relative_path=relative_path, size=size, mime_type="application/pdf")
        self.session.add(version)
        self.session.flush()
        for page in range(1, 4):
            self.session.add(ResourceText(version_id=version.id, page_number=page, text=body,
                                          markdown=body, no_text_layer=False))

    def assignment(self, course_id: int, key: str, title: str, due_at: datetime) -> Assignment:
        item = self.session.scalar(select(Assignment).where(Assignment.source == "demo", Assignment.source_key == key))
        if item is None:
            item = Assignment(source="demo", source_key=key, course_id=course_id,
                              title=title, url=None, due_at=due_at)
            self.session.add(item)
            self.session.flush()
        return item

    def deadline(self, course_id: int, assignment_id: int, key: str, title: str, due_at: datetime) -> None:
        if self.session.scalar(select(Deadline.id).where(Deadline.source == "demo", Deadline.source_key == key)):
            return
        self.session.add(Deadline(source="demo", source_key=key, course_id=course_id,
                                  assignment_id=assignment_id, title=title, due_at=due_at, url=None))

    def topic(self, course_id: int, slug: str, name: str) -> LearningTopic:
        item = self.session.scalar(select(LearningTopic).where(
            LearningTopic.course_id == course_id, LearningTopic.slug == slug))
        if item is None:
            item = LearningTopic(course_id=course_id, slug=slug, name=name)
            self.session.add(item)
            self.session.flush()
        return item

    def card_history(self, resource_id: int, topic_id: int, key: str, reviewed_at: datetime) -> None:
        if self.session.scalar(select(AnkiCard.id).where(AnkiCard.note_id == key)):
            return
        queue = AnkiCardQueue(resource_id=resource_id, status="approved", topic_id=topic_id,
                              payload='{"front":"Was ist eine Schleife?","back":"Wiederholte Ausführung."}')
        self.session.add(queue)
        self.session.flush()
        card = AnkiCard(queue_id=queue.id, note_id=key)
        self.session.add(card)
        self.session.flush()
        for rating in (1, 1, 2, 1, 3):
            self.session.add(AnkiReview(card_id=card.id, reviewed_at=reviewed_at, rating=rating))

    def exam_and_block(self, course_id: int, topic_id: int, exam_at: datetime, block_at: datetime) -> None:
        exam = self.session.scalar(select(Exam).where(Exam.source_key == "demo-programming-exam"))
        if exam is None:
            exam = Exam(course_id=course_id, source_key="demo-programming-exam",
                        title="Demo-Klausur Programmieren", exam_at=exam_at)
            self.session.add(exam)
            self.session.flush()
        if not self.session.scalar(select(StudyBlockSuggestion.id).where(
                StudyBlockSuggestion.exam_id == exam.id, StudyBlockSuggestion.topic_id == topic_id)):
            self.session.add(StudyBlockSuggestion(exam_id=exam.id, topic_id=topic_id,
                                                  duration_minutes=45, starts_at=block_at, status="proposed"))

    def grade(self, course_id: int) -> None:
        exam = self.session.scalar(select(Exam).where(Exam.source_key == "demo-english-exam"))
        if exam is None:
            exam = Exam(course_id=course_id, source_key="demo-english-exam",
                        title="Demo-Prüfung Englisch", exam_at=utc_now())
            self.session.add(exam)
            self.session.flush()
        if not self.session.scalar(select(Grade.id).where(Grade.exam_id == exam.id)):
            self.session.add(Grade(exam_id=exam.id, value="1,7"))

    def exercise(self, topic_id: int, question: str, solution: str) -> None:
        if not self.session.scalar(select(Exercise.id).where(
                Exercise.topic_id == topic_id, Exercise.question == question)):
            self.session.add(Exercise(topic_id=topic_id, question=question, solution=solution,
                                      difficulty="easy"))

    def project(self, course_id: int, deadline_at: datetime) -> None:
        if self.session.scalar(select(Project.id).where(
                Project.course_id == course_id, Project.name == "Demo-Projekt Lernplaner")):
            return
        self.session.add(Project(name="Demo-Projekt Lernplaner", course_id=course_id,
                                 deadline_at=deadline_at, notes="Erfundenes Beispielprojekt ohne externes Repository.",
                                 members=[], links=[], todos=[{"title": "Startseite gestalten", "done": False}],
                                 github_repo=None, revision=1))

    def timeline(self, course_id: int, resource_id: int) -> None:
        if self.session.scalar(select(SyncRun.id).where(SyncRun.status == "demo")):
            return
        run = SyncRun(status="demo", started_at=utc_now(), finished_at=utc_now(),
                      course_count=4, resource_count=12, change_count=3)
        self.session.add(run)
        self.session.flush()
        self.session.add_all([
            Change(sync_run_id=run.id, course_id=course_id, resource_id=resource_id,
                   kind="new", summary="Demo: Vorlesungsfolie hinzugefügt"),
            Change(sync_run_id=run.id, course_id=course_id, kind="assignment",
                   summary="Demo: neues Übungsblatt mit Frist"),
            Change(sync_run_id=run.id, kind="sync", summary="Demo-Semester eingerichtet"),
        ])
        self.session.add(Notification(event_key="demo:welcome", title="Demo-Semester bereit",
                                      body="Alle Inhalte sind erfunden und liegen nur im Demo-Ordner."))

    def commit(self) -> None:
        self.session.commit()
