# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store short audio memos locally and link corrected text to quick captures."""

from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from app.config import Settings
from app.db.models import Assignment, Course, Jot, LearningTopic, VoiceMemo, utc_now
from app.files.atomic import ensure_directory, write_once
from app.host.lease import HostCoordinator
from app.intake.smart_capture import triage
from app.voice.transcription import TranscriptionError, model_ready, transcribe

MAX_VOICE_SIZE = 15 * 1024 * 1024
MIME_SUFFIX = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a",
               "audio/m4a": ".m4a", "audio/x-m4a": ".m4a",
               "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
               "audio/mpeg": ".mp3", "audio/mp3": ".mp3"}


class VoiceUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    transcript: str = Field(default="", max_length=10_000)
    course_id: int | None = None
    topic_id: int | None = None


class VoiceView(BaseModel):
    id: str
    title: str
    transcript: str
    course_id: int | None
    course_name: str | None
    topic_id: int | None
    topic_name: str | None
    jot_id: str
    audio_url: str
    mime_type: str
    size: int
    revision: int
    created_at: datetime
    task_id: int | None = None


def _mime(value: str | None, content: bytes) -> tuple[str, str]:
    mime = (value or "").split(";", 1)[0].strip().lower()
    suffix = MIME_SUFFIX.get(mime)
    if suffix is None:
        raise HTTPException(415, "Nur WebM, Ogg, M4A, WAV oder MP3 werden unterstützt")
    signature = {"audio/webm": content.startswith(b"\x1a\x45\xdf\xa3"),
                 "audio/ogg": content.startswith(b"OggS"),
                 "audio/mp4": len(content) > 8 and content[4:8] == b"ftyp",
                 "audio/m4a": len(content) > 8 and content[4:8] == b"ftyp",
                 "audio/x-m4a": len(content) > 8 and content[4:8] == b"ftyp",
                 "audio/wav": content.startswith(b"RIFF") and content[8:12] == b"WAVE",
                 "audio/x-wav": content.startswith(b"RIFF") and content[8:12] == b"WAVE",
                 "audio/wave": content.startswith(b"RIFF") and content[8:12] == b"WAVE",
                 "audio/mpeg": content.startswith((b"ID3", b"\xff\xfb")),
                 "audio/mp3": content.startswith((b"ID3", b"\xff\xfb"))}
    if not signature[mime]:
        raise HTTPException(415, "Audiodatei hat kein passendes Format")
    return mime, suffix


def _course_topic(session, course_id: int | None, topic_id: int | None) -> int | None:
    if topic_id is not None:
        topic = session.get(LearningTopic, topic_id)
        if topic is None:
            raise HTTPException(404, "Lernthema nicht gefunden")
        if course_id is not None and course_id != topic.course_id:
            raise HTTPException(422, "Lernthema gehört nicht zum Kurs")
        course_id = topic.course_id
    if course_id is not None and session.get(Course, course_id) is None:
        raise HTTPException(404, "Kurs nicht gefunden")
    return course_id


def _view(memo: VoiceMemo, course: Course | None, topic: LearningTopic | None,
          task_id: int | None = None) -> VoiceView:
    return VoiceView(id=memo.id, title=memo.title, transcript=memo.transcript,
                     course_id=memo.course_id, course_name=course.name if course else None,
                     topic_id=memo.topic_id, topic_name=topic.name if topic else None,
                     jot_id=memo.jot_id or "", audio_url=f"/api/voice/{memo.id}/audio",
                     mime_type=memo.mime_type, size=memo.size, revision=memo.revision,
                     created_at=memo.created_at, task_id=task_id)


def _jot_body(memo: VoiceMemo) -> str:
    return memo.transcript or f"Sprachnotiz: {memo.title}"


def voice_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/voice")

    @router.get("/transcription/status")
    def transcription_status():
        return {"available": model_ready(settings.voice_model_dir), "local": True, "language": "de"}

    @router.post("/transcribe")
    def transcribe_audio(file: Annotated[UploadFile, File()], language: Annotated[str, Form()] = 'de'):
        coordinator.assert_writer()
        content = file.file.read(MAX_VOICE_SIZE + 1)
        if not content or len(content) > MAX_VOICE_SIZE:
            raise HTTPException(413, "Die Aufnahme muss zwischen 1 Byte und 15 MB groß sein")
        _mime(file.content_type, content)
        if language not in {'de', 'en'}:
            raise HTTPException(422, 'Sprache muss Deutsch oder Englisch sein')
        try:
            text = transcribe(content, settings.voice_model_dir) if language == 'de' else transcribe(content, settings.voice_model_dir, language='en')
            return {"transcript": text, "local": True, 'language': language}
        except TranscriptionError as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.get("", response_model=list[VoiceView])
    def list_voice():
        with factory() as session:
            rows = session.execute(select(VoiceMemo, Course, LearningTopic)
                .outerjoin(Course, VoiceMemo.course_id == Course.id)
                .outerjoin(LearningTopic, VoiceMemo.topic_id == LearningTopic.id)
                .order_by(VoiceMemo.created_at.desc()).limit(100)).all()
            task_ids = {task.source_key: task.id for task in session.scalars(select(Assignment).where(
                Assignment.source == "smart_capture",
                Assignment.source_key.in_([memo.jot_id for memo, _, _ in rows if memo.jot_id]))).all()}
            return [_view(memo, course, topic, task_ids.get(memo.jot_id or "")) for memo, course, topic in rows]

    @router.post("", response_model=VoiceView)
    def capture_voice(file: Annotated[UploadFile, File()], title: Annotated[str, Form()],
                      transcript: Annotated[str, Form()] = "", course_id: Annotated[int | None, Form()] = None,
                      topic_id: Annotated[int | None, Form()] = None):
        coordinator.assert_writer()
        title = title.strip()
        transcript = transcript.strip()
        if not 1 <= len(title) <= 200 or len(transcript) > 10_000:
            raise HTTPException(422, "Titel oder Transkript ist zu lang")
        content = file.file.read(MAX_VOICE_SIZE + 1)
        if not content:
            raise HTTPException(422, "Audio fehlt")
        if len(content) > MAX_VOICE_SIZE:
            raise HTTPException(413, "Sprachnotiz ist größer als 15 MB")
        mime, suffix = _mime(file.content_type, content)
        memo_id = str(uuid4())
        relative_path = f"voice/{memo_id}{suffix}"
        folder = ensure_directory(settings.data_dir, "voice")
        target = folder / f"{memo_id}{suffix}"
        with factory() as session:
            course_id = _course_topic(session, course_id, topic_id)
            write_once(target, content)
            try:
                jot_id = str(uuid4())
                memo = VoiceMemo(id=memo_id, title=title, transcript=transcript,
                                 course_id=course_id, topic_id=topic_id, jot_id=jot_id,
                                 relative_path=relative_path, mime_type=mime, size=len(content),
                                 revision=1, created_at=utc_now(), updated_at=utc_now())
                jot = Jot(id=jot_id, kind="thought", body=_jot_body(memo),
                          course_id=course_id, created_at=memo.created_at, updated_at=utc_now())
                session.add(jot)
                session.add(memo)
                session.execute(text("INSERT INTO jots_fts(jot_id, body) VALUES (:id, :body)"),
                                {"id": jot_id, "body": _jot_body(memo)})
                if transcript:
                    triage(session, jot, settings, source_kind="voice", source_id=memo_id)
                    memo.course_id = jot.course_id
                session.commit()
                task = session.scalar(select(Assignment).where(Assignment.source == "smart_capture",
                                                               Assignment.source_key == jot_id))
                return _view(memo, session.get(Course, memo.course_id) if memo.course_id else None,
                             session.get(LearningTopic, topic_id) if topic_id else None,
                             task.id if task else None)
            except Exception:
                session.rollback()
                target.unlink(missing_ok=True)
                raise

    @router.patch("/{memo_id}", response_model=VoiceView)
    def update_voice(memo_id: str, payload: VoiceUpdate):
        coordinator.assert_writer()
        with factory() as session:
            memo = session.get(VoiceMemo, memo_id)
            if memo is None:
                raise HTTPException(404, "Sprachnotiz nicht gefunden")
            if memo.revision != payload.expected_revision:
                raise HTTPException(409, "Sprachnotiz wurde inzwischen geändert")
            course_id = _course_topic(session, payload.course_id, payload.topic_id)
            memo.title = payload.title.strip()
            if not memo.title:
                raise HTTPException(422, "Titel fehlt")
            memo.transcript = payload.transcript.strip()
            memo.course_id = course_id
            memo.topic_id = payload.topic_id
            memo.revision += 1
            memo.updated_at = utc_now()
            jot = session.get(Jot, memo.jot_id)
            if jot is None:
                raise HTTPException(409, "Verknüpfte Schnellerfassung fehlt")
            jot.body = _jot_body(memo)
            jot.course_id = course_id
            jot.updated_at = utc_now()
            session.execute(text("DELETE FROM jots_fts WHERE jot_id = :id"), {"id": jot.id})
            session.execute(text("INSERT INTO jots_fts(jot_id, body) VALUES (:id, :body)"),
                            {"id": jot.id, "body": jot.body})
            if memo.transcript:
                triage(session, jot, settings, source_kind="voice", source_id=memo.id)
                memo.course_id = jot.course_id
            session.commit()
            task = session.scalar(select(Assignment).where(Assignment.source == "smart_capture",
                                                           Assignment.source_key == jot.id))
            return _view(memo, session.get(Course, memo.course_id) if memo.course_id else None,
                         session.get(LearningTopic, payload.topic_id) if payload.topic_id else None,
                         task.id if task else None)

    @router.get("/{memo_id}/audio")
    def audio(memo_id: str):
        with factory() as session:
            memo = session.get(VoiceMemo, memo_id)
            if memo is None:
                raise HTTPException(404, "Sprachnotiz nicht gefunden")
            root = settings.data_dir.resolve()
            path = (root / Path(memo.relative_path)).resolve()
            if not path.is_relative_to(root / "voice") or path.is_symlink() or not path.is_file():
                raise HTTPException(404, "Audio nicht gefunden")
            return FileResponse(path, media_type=memo.mime_type,
                                headers={"Cache-Control": "private, no-store",
                                         "X-Content-Type-Options": "nosniff"})

    return router
