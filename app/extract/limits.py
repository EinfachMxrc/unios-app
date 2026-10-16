# SPDX-License-Identifier: AGPL-3.0-or-later
"""Input size limits shared by the indexing queue and the isolated parser, so they cannot disagree."""

MAX_PDF_BYTES = 512 * 1024 * 1024
MAX_OTHER_BYTES = 64 * 1024 * 1024


def is_pdf(suffix: str, mime: str | None) -> bool:
    return suffix.lower() == ".pdf" or mime == "application/pdf"


def input_limit(suffix: str, mime: str | None) -> int:
    return MAX_PDF_BYTES if is_pdf(suffix, mime) else MAX_OTHER_BYTES
