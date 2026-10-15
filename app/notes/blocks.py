# SPDX-License-Identifier: AGPL-3.0-or-later

"""Lossless top-level Markdown blocks for versioned CLI/API edits."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BlockEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    operation: Literal["insert", "replace", "move", "delete"]
    index: int = Field(ge=0)
    markdown: str | None = Field(default=None, min_length=1, max_length=100_000)
    destination: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def valid_operation(self):
        if (self.operation in {"insert", "replace"}) != (self.markdown is not None):
            raise ValueError("Text nur für Einfügen oder Ersetzen angeben")
        if (self.operation == "move") != (self.destination is not None):
            raise ValueError("Ziel nur für Verschieben angeben")
        return self


def block_spans(body: str) -> list[tuple[int, int]]:
    """Keep original bytes between boundaries, including fences and directives."""
    lines = body.splitlines(keepends=True)
    offsets, cursor = [], 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line)
    spans = []
    index = 0
    while index < len(lines):
        if not lines[index].strip():
            index += 1
            continue
        start = index
        fence = re.match(r"^ {0,3}(`{3,}|~{3,})", lines[index])
        directive = re.match(r"^:::\w", lines[index]) and not lines[index].rstrip().endswith(":::")
        if fence:
            marker = fence[1]
            index += 1
            while index < len(lines):
                closed = re.match(r"^ {0,3}" + re.escape(marker[0]) + "{" + str(len(marker)) + r",}\s*$", lines[index])
                index += 1
                if closed:
                    break
        elif directive:
            depth = 1
            index += 1
            while index < len(lines):
                if lines[index].strip() == ":::":
                    depth -= 1
                elif re.match(r"^:::\w", lines[index]) and not lines[index].rstrip().endswith(":::"):
                    depth += 1
                index += 1
                if depth == 0:
                    break
        elif re.match(r"^(#{1,6}\s| {0,3}(?:---+|\*\*\*+)\s*$|:::entity|:::media)", lines[index]):
            index += 1
        else:
            index += 1
            while index < len(lines) and lines[index].strip():
                if re.match(r"^(#{1,6}\s| {0,3}(?:`{3,}|~{3,})|:::\w)", lines[index]):
                    break
                index += 1
        spans.append((offsets[start], offsets[index] if index < len(lines) else len(body)))
    return spans


def list_blocks(body: str) -> list[dict]:
    blocks = []
    for index, (start, end) in enumerate(block_spans(body)):
        markdown = body[start:end]
        stripped = markdown.lstrip()
        kind = "paragraph"
        if match := re.match(r"^(#{1,6})\s", stripped):
            kind = f"heading{len(match[1])}"
        elif re.match(r"^(`{3,}|~{3,})", stripped):
            kind = "code"
        elif stripped.startswith(":::callout"):
            kind = "callout"
        elif stripped.startswith(":::entity"):
            kind = "entity"
        elif stripped.startswith((":::media", "![")):
            kind = "media"
        elif re.match(r"^[-*+] \[[ xX]\]", stripped):
            kind = "taskList"
        elif re.match(r"^(?:[-*+] |\d+[.)] )", stripped):
            kind = "list"
        elif stripped.startswith(">"):
            kind = "quote"
        elif re.search(r"\n\s*\|?\s*:?-{3,}", markdown):
            kind = "table"
        elif re.match(r"^(?:---+|\*\*\*+)\s*$", stripped):
            kind = "divider"
        blocks.append({"index": index, "type": kind, "markdown": markdown})
    return blocks


def edit_blocks(body: str, edit: BlockEdit) -> str:
    spans = block_spans(body)
    limit = len(spans) if edit.operation == "insert" else len(spans) - 1
    if edit.index > limit or (edit.destination is not None and edit.destination >= len(spans)):
        raise ValueError("Blockposition außerhalb der Notiz")
    if edit.operation == "insert":
        position = spans[edit.index][0] if edit.index < len(spans) else len(body)
        result = body[:position] + ("\n\n" if position and not body[:position].endswith("\n\n") else "")
        result += (edit.markdown or "").strip("\n") + "\n\n" + body[position:]
    else:
        start, end = spans[edit.index]
        if edit.operation == "replace":
            result = body[:start] + (edit.markdown or "").strip("\n") + "\n" + body[end:]
        elif edit.operation == "delete":
            result = body[:start] + body[end:]
        else:
            target = edit.destination
            assert target is not None
            if target == edit.index:
                return body
            position = spans[target][0] if target < edit.index else spans[target][1]
            moved = body[start:end].strip("\n") + "\n\n"
            if position < start:
                result = body[:position] + moved + body[position:start] + body[end:]
            else:
                result = body[:start] + body[end:position] + "\n" + moved + body[position:]
    if not result.strip() or len(result) > 100_000:
        raise ValueError("Notiz muss Text enthalten und darf höchstens 100000 Zeichen haben")
    return result
