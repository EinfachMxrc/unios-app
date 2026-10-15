# SPDX-License-Identifier: AGPL-3.0-or-later

import io
import wave

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.notes.media_service import MAX_BYTES, NoteMediaStore


def wav_sample() -> bytes:
    data = io.BytesIO()
    with wave.open(data, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8000)
        output.writeframes(bytes(16000))
    return data.getvalue()


def test_private_media_is_immutable_and_supports_audio_ranges(settings, factory, coordinator):
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        raw = wav_sample()
        uploaded = client.post("/api/note-assets", files={"file": ("fictional.wav", raw, "audio/wav")})
        assert uploaded.status_code == 200, uploaded.text
        source = uploaded.json()["src"]
        assert uploaded.json()["kind"] == "audio"
        assert client.get(source).content == raw
        partial = client.get(source, headers={"Range": "bytes=0-43"})
        assert partial.status_code == 206 and partial.content == raw[:44]
        assert client.post("/api/note-assets", files={"file": ("again.wav", raw, "audio/wav")}).json()["src"] != source
        assert client.post("/api/note-assets", files={"file": ("bad.png", b'<svg onload="alert(1)"/>', "image/png")}).status_code == 422
        assert client.post("/api/note-assets", headers={"Origin": "https://hostile.example"},
                           files={"file": ("attack.wav", raw, "audio/wav")}).status_code == 403
        assert client.get(source, headers={"Origin": "https://hostile.example"}).status_code == 403


def test_invalid_paths_formats_size_and_lost_writer_are_rejected(settings):
    store = NoteMediaStore(settings.data_dir)
    for path in ('../secrets', 'bad.svg', '00000000-0000-0000-0000-000000000000.jpg'):
        with pytest.raises((ValueError, FileNotFoundError)):
            store.read(path)
    for raw in (b'', b'MZ executable', b'ID3' + bytes(MAX_BYTES)):
        with pytest.raises(ValueError):
            store.save(raw, lambda: None)
    def denied():
        raise RuntimeError("Writer lost")
    with pytest.raises(RuntimeError):
        store.save(wav_sample(), denied)
    assert not store.root.exists()


def test_unpaired_device_cannot_upload_or_read_private_note_media(settings, factory, coordinator):
    configured = settings.model_copy(update={"api_auth_required": True})
    source = NoteMediaStore(configured.data_dir).save(wav_sample(), coordinator.assert_writer)["src"]
    with TestClient(create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.get(source).status_code == 401
        assert client.post("/api/note-assets", files={"file": ("fixture.wav", wav_sample(), "audio/wav")}).status_code == 401
