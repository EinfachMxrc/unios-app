# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fetch a fixed multilingual Whisper model when building UniOS, never on a user's recording."""

import hashlib
import json
from pathlib import Path

from huggingface_hub import snapshot_download

MODEL = "Systran/faster-whisper-base"
REVISION = "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"
FILES = ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt")


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "desktop" / "voice-model"
    snapshot_download(MODEL, revision=REVISION, local_dir=str(destination), allow_patterns=list(FILES))
    hashes = {name: hashlib.sha256((destination / name).read_bytes()).hexdigest() for name in FILES}
    manifest = destination / "unios-model.json"
    body = json.dumps({"repository": MODEL, "revision": REVISION, "sha256": hashes}, indent=2)
    if not manifest.exists() or manifest.read_text(encoding="utf-8") != body:
        manifest.write_text(body, encoding="utf-8")
    print("Lokales deutsches Sprachmodell für den App-Build bereit")


if __name__ == "__main__":
    main()
