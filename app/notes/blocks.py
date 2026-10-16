# SPDX-License-Identifier: AGPL-3.0-or-later

"""Block-level edits on note documents for versioned CLI/API/MCP clients."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.notes.document import Block, Document, DocumentError, validate
from app.notes.markdown import parse_markdown, render_markdown


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


def _kind(block: Block) -> str:
    return f"heading{block.props.get('level', 1)}" if block.type == "heading" else block.type


def list_blocks(document: Document) -> list[dict]:
    return [{"index": index, "id": block.id, "type": _kind(block),
             "markdown": render_markdown(Document(blocks=[block]))}
            for index, block in enumerate(document.blocks)]


def edit_document(document: Document, edit: BlockEdit) -> Document:
    blocks = list(document.blocks)
    limit = len(blocks) if edit.operation == "insert" else len(blocks) - 1
    if edit.index > limit or (edit.destination is not None and edit.destination >= len(blocks)):
        raise ValueError("Blockposition außerhalb der Notiz")
    fresh = parse_markdown(edit.markdown).blocks if edit.markdown is not None else []
    if edit.operation == "insert":
        blocks[edit.index:edit.index] = fresh
    elif edit.operation == "replace":
        if len(fresh) == 1:
            fresh[0].id = blocks[edit.index].id
        blocks[edit.index:edit.index + 1] = fresh
    elif edit.operation == "delete":
        del blocks[edit.index]
    else:
        assert edit.destination is not None
        blocks.insert(edit.destination, blocks.pop(edit.index))
    try:
        result = validate(Document(blocks=blocks))
    except DocumentError as exc:
        raise ValueError(str(exc)) from exc
    if not result.blocks:
        raise ValueError("Notiz muss Text enthalten und darf höchstens 100000 Zeichen haben")
    return result
