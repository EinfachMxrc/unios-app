# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative lecture detection for local, versioned note scaffolds."""

import re
from pathlib import Path

LECTURE_NAME = re.compile(r"(?:^|[\s_\-])(?:vl|vorlesung|lecture)\s*[-_. ]*\d+\b", re.IGNORECASE)
TEMPLATE = ("## Kernkonzepte\n\n"
            "## Hinweise für die Prüfung\n\n"
            "## Offene Fragen\n\n"
            "## Verknüpfte Übungsblätter\n")


def lecture_title(filename: str, *, file_hint: str | None = None) -> str | None:
    if Path(file_hint or filename).suffix.lower() not in {".pdf", ".ppt", ".pptx", ".docx"}:
        return None
    title = Path(filename).stem.replace("_", " ").strip()
    return title[:200] if LECTURE_NAME.search(title) else None
