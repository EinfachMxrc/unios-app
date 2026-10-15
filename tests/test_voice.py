# SPDX-License-Identifier: AGPL-3.0-or-later

"""Audio remains local and corrected transcripts update their quick capture."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db.models import Course, Jot, LearningTopic
from app.voice.api import voice_router


def test_voice_capture_audio_transcript_and_topic(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE jots_fts USING fts5(jot_id UNINDEXED, body)"))
        course = Course(source="fixture", source_id="voice-course", name="Programmieren")
        session.add(course)
        session.flush()
        topic = LearningTopic(course_id=course.id, slug="rekursion", name="Rekursion")
        session.add(topic)
        session.commit()
        course_id, topic_id = course.id, topic.id

    app = FastAPI()
    app.include_router(voice_router(settings, factory, coordinator))
    client = TestClient(app)
    audio = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 36
    created = client.post("/api/voice", data={"title": "Gedanke", "transcript": "Rekursion verstanden",
                     "course_id": str(course_id), "topic_id": str(topic_id)},
                     files={"file": ("memo.wav", audio, "audio/wav")})
    assert created.status_code == 200
    memo = created.json()
    assert memo["topic_name"] == "Rekursion"
    assert client.get(memo["audio_url"]).content == audio
    with factory() as session:
        assert session.get(Jot, memo["jot_id"]).body == "Rekursion verstanden"
        assert session.execute(text("SELECT body FROM jots_fts WHERE jot_id = :id"),
                               {"id": memo["jot_id"]}).scalar_one() == "Rekursion verstanden"

    updated = client.patch(f'/api/voice/{memo["id"]}', json={"expected_revision": 1,
        "title": "Gedanke", "transcript": "Rekursion mit Basisfall", "course_id": course_id,
        "topic_id": topic_id})
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    task = client.patch(f'/api/voice/{memo["id"]}', json={"expected_revision": 2,
        "title": "Gedanke", "transcript": "Übungsblatt 3 Aufgabe 2 mit Lukas durchgehen",
        "course_id": course_id, "topic_id": topic_id})
    assert task.status_code == 200, task.text
    assert task.json()["task_id"] is not None
    assert client.get("/api/voice").json()[0]["task_id"] == task.json()["task_id"]
    assert client.patch(f'/api/voice/{memo["id"]}', json={"expected_revision": 1,
        "title": "Alt", "transcript": "", "course_id": None, "topic_id": None}).status_code == 409
    with factory() as session:
        assert session.scalar(select(Jot).where(Jot.id == memo["jot_id"])).body == "Übungsblatt 3 Aufgabe 2 mit Lukas durchgehen"
        assert session.execute(text("SELECT body FROM jots_fts WHERE jot_id = :id"),
                               {"id": memo["jot_id"]}).scalar_one() == "Übungsblatt 3 Aufgabe 2 mit Lukas durchgehen"
    assert client.post("/api/voice", data={"title": "Falsch"},
                       files={"file": ("fake.wav", b"not audio", "audio/wav")}).status_code == 415
