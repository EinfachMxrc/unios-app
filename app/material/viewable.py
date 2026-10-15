# SPDX-License-Identifier: AGPL-3.0-or-later

"""Which stored files UniOS shows itself, and the type they are served with.

Mirrors ``frontend/src/lib/materialView.ts`` (``fileViewKind``). PDFs, slides
and Word files with a converted PDF keep their reader; HTML and Markdown keep
the readable page. Everything listed here opens in the file viewer instead of
only downloading. Code and plain text are served as text/plain, never as a
type a browser would run.
"""

from pathlib import PurePath
from typing import Literal

ViewKind = Literal["image", "audio", "video", "code", "text", "table", "docx", "xlsx"]

# A browser shows these images itself; SVG only ever lands in an <img>, where it cannot run code.
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
               ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml"}
AUDIO_TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".oga": "audio/ogg",
               ".m4a": "audio/mp4", ".flac": "audio/flac"}
VIDEO_TYPES = {".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm"}
CODE_SUFFIXES = {
    ".py", ".ipynb", ".java", ".kt", ".scala", ".c", ".h", ".cpp", ".cc", ".hpp", ".cs", ".go", ".rs", ".swift",
    ".js", ".mjs", ".jsx", ".ts", ".tsx", ".php", ".rb", ".pl", ".lua", ".r", ".m", ".hs", ".ml", ".erl", ".ex",
    ".sql", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".asm", ".s", ".vhd", ".vhdl", ".v", ".sv",
    ".json", ".jsonl", ".yaml", ".yml", ".toml", ".xml", ".css", ".scss", ".tex", ".bib", ".gradle", ".cmake",
    ".dockerfile", ".makefile", ".mk", ".pro", ".prolog", ".dart",
}
TEXT_SUFFIXES = {".log", ".ini", ".cfg", ".conf", ".properties", ".env.example", ".rst", ".adoc"}
TABLE_SUFFIXES = {".csv", ".tsv"}
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TEXT = "text/plain"

# Text is read whole by the viewer; anything larger is a data dump better downloaded.
MAX_TEXT_BYTES = 2_000_000


def view_for(filename: str) -> tuple[ViewKind, str] | None:
    """The viewer kind and served media type of a file, or None when only downloading makes sense."""
    name = PurePath(filename).name.casefold()
    suffix = PurePath(name).suffix
    if name in {"makefile", "dockerfile"}:
        return "code", TEXT
    if suffix in IMAGE_TYPES:
        return "image", IMAGE_TYPES[suffix]
    if suffix in AUDIO_TYPES:
        return "audio", AUDIO_TYPES[suffix]
    if suffix in VIDEO_TYPES:
        return "video", VIDEO_TYPES[suffix]
    if suffix in CODE_SUFFIXES:
        return "code", TEXT
    if suffix in TEXT_SUFFIXES:
        return "text", TEXT
    if suffix in TABLE_SUFFIXES:
        return "table", TEXT
    if suffix in {".docx", ".docm"}:
        return "docx", DOCX
    if suffix in {".xlsx", ".xlsm"}:
        return "xlsx", XLSX
    return None
