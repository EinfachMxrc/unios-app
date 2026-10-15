# SPDX-License-Identifier: AGPL-3.0-or-later

"""Path resolution that behaves the same for short and very long Windows paths."""

import os
from pathlib import Path

EXTENDED_PREFIX = r"\\?" + "\\"
EXTENDED_UNC_PREFIX = EXTENDED_PREFIX + "UNC" + "\\"


def native_path(path: Path) -> Path:
    """Extended paths for Windows I/O; keep persisted relative paths portable."""
    absolute = str(path.absolute())
    if os.name != "nt" or absolute.startswith(EXTENDED_PREFIX):
        return Path(absolute)
    if absolute.startswith("\\\\"):
        return Path(EXTENDED_UNC_PREFIX + absolute[2:])
    return Path(EXTENDED_PREFIX + absolute)


def strip_extended_prefix(text: str) -> str:
    """Drop the extended-length marker Windows adds to paths longer than 259 characters."""
    if text.startswith(EXTENDED_UNC_PREFIX):
        return "\\\\" + text[len(EXTENDED_UNC_PREFIX):]
    if text.startswith(EXTENDED_PREFIX) and text[len(EXTENDED_PREFIX) + 1:len(EXTENDED_PREFIX) + 2] == ":":
        return text[len(EXTENDED_PREFIX):]
    return text


def resolve_local(path: Path) -> Path:
    """``Path.resolve()`` without the extended-length prefix.

    Python only adds the prefix to long paths, so comparing a resolved long file
    with a resolved short folder wrongly looked like an escape from that folder.
    """
    resolved = path.resolve()
    text = strip_extended_prefix(str(resolved))
    return resolved if text == str(resolved) else Path(text)
