# SPDX-License-Identifier: AGPL-3.0-or-later

"""Offline German transcription with the multilingual model shipped in the desktop app."""

import io
import os
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

MAX_SECONDS = 300
SAMPLE_RATE = 16_000
_lock = threading.Lock()


class TranscriptionError(RuntimeError):
    pass


def model_ready(folder: Path) -> bool:
    return all((folder / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json"))


@lru_cache(maxsize=1)
def _model(folder: str) -> Any:
    from faster_whisper import WhisperModel

    return WhisperModel(folder, device="cpu", compute_type="int8", local_files_only=True,
                        cpu_threads=min(4, os.cpu_count() or 1), num_workers=1)


def _decode(content: bytes) -> Any:
    import av
    import numpy as np

    parts = []
    samples = 0
    try:
        with av.open(io.BytesIO(content), mode="r") as container:
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(audio=0):
                for converted in resampler.resample(frame):
                    part = converted.to_ndarray().flatten()
                    samples += part.size
                    if samples > SAMPLE_RATE * MAX_SECONDS:
                        raise TranscriptionError("Die Aufnahme darf höchstens fünf Minuten lang sein.")
                    parts.append(part)
            for converted in resampler.resample(None):
                parts.append(converted.to_ndarray().flatten())
    except TranscriptionError:
        raise
    except Exception as exc:
        raise TranscriptionError("Die Audiodatei konnte nicht gelesen werden.") from exc
    if not parts:
        raise TranscriptionError("Die Aufnahme enthält kein Audio.")
    audio = np.concatenate(parts).astype(np.float32) / 32768.0
    if audio.size > SAMPLE_RATE * MAX_SECONDS:
        raise TranscriptionError("Die Aufnahme darf höchstens fünf Minuten lang sein.")
    return audio


def transcribe(content: bytes, folder: Path, language: str = 'de') -> str:
    if language not in {'de', 'en'}:
        raise TranscriptionError('Diese Sprache wird nicht unterstützt.')
    if not model_ready(folder):
        raise TranscriptionError("Das lokale Sprachmodell fehlt im UniOS-Paket. Bitte die App aktualisieren.")
    if not _lock.acquire(blocking=False):
        raise TranscriptionError("Eine andere Aufnahme wird gerade transkribiert. Bitte kurz warten.")
    try:
        audio = _decode(content)
        segments, _ = _model(str(folder.resolve())).transcribe(
            audio, language=language, beam_size=3, condition_on_previous_text=False,
            vad_filter=True, temperature=0)
        return " ".join(segment.text.strip() for segment in segments).strip()[:10_000]
    except TranscriptionError:
        raise
    except Exception as exc:
        raise TranscriptionError("Die lokale Spracherkennung konnte nicht ausgeführt werden.") from exc
    finally:
        _lock.release()
