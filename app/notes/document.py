# SPDX-License-Identifier: AGPL-3.0-or-later

"""Canonical block document for notes: typed blocks with stable ids."""

import hashlib
import json
import re
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

SCHEMA_VERSION = 1
MAX_TEXT_LENGTH = 100_000
MAX_SERIALIZED_BYTES = 1_500_000
MAX_BLOCKS = 5_000
MAX_DEPTH = 8
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{6,36}$")

BlockType = Literal[
    "paragraph", "heading", "bullet", "numbered", "todo", "toggle", "quote", "callout",
    "code", "divider", "table", "media", "entity", "equation", "study",
]
Mark = Literal["bold", "italic", "strike", "code", "underline", "highlight"]


class DocumentError(ValueError):
    pass


class Inline(BaseModel):
    """Either a text run (optionally marked/linked) or a `[[title]]` note link."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["text", "wikilink", "math"] = "text"
    text: str = ""
    latex: str | None = Field(default=None, max_length=2000)
    color: Literal["yellow", "green", "blue", "pink"] | None = None
    marks: list[Mark] = Field(default_factory=list, max_length=6)
    href: str | None = Field(default=None, max_length=2000)
    title: str | None = Field(default=None, max_length=200)

    @field_validator("href")
    @classmethod
    def safe_href(cls, value: str | None) -> str | None:
        if value is not None and re.match(r"^\s*(?:javascript|data|vbscript):", value, re.IGNORECASE):
            raise ValueError("Unsicheres Linkziel")
        return value


class Block(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: BlockType
    props: dict[str, Any] = Field(default_factory=dict)
    content: list[Inline] = Field(default_factory=list)
    children: list["Block"] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def valid_id(cls, value: str) -> str:
        if not ID_PATTERN.match(value):
            raise ValueError("Ungültige Block-ID")
        return value


class Document(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    blocks: list[Block] = Field(default_factory=list)


def new_id() -> str:
    return uuid4().hex[:12]


def seeded_ids(seed: str):
    """Deterministic ids so converting the same legacy revision twice yields one document."""
    counter = 0
    while True:
        counter += 1
        yield hashlib.sha256(f"{seed}:{counter}".encode()).hexdigest()[:12]


def walk(blocks: list[Block]):
    for block in blocks:
        yield block
        yield from walk(block.children)


def _check_shape(blocks: list[Block], depth: int = 1) -> None:
    if depth > MAX_DEPTH:
        raise DocumentError("Notiz ist zu tief verschachtelt")
    for block in blocks:
        if block.type == "heading" and block.props.get("level") not in {1, 2, 3, 4, 5, 6}:
            raise DocumentError("Überschrift braucht eine Ebene von 1 bis 6")
        if block.type == "media":
            src = block.props.get("src", "")
            if (block.props.get("kind", "image") not in {"image", "audio", "video"} or not isinstance(src, str)
                    or len(src) > 2000 or re.match(r"^\s*(?:javascript|data|vbscript):", src, re.IGNORECASE)):
                raise DocumentError("Ungültiger Medienbaustein")
        if block.type == "entity" and (not isinstance(block.props.get("id", 0), int)
                                       or not isinstance(block.props.get("kind", ""), str)):
            raise DocumentError("Ungültiger Verweisbaustein")
        if block.type == "study" and (block.props.get("kind") not in {"diagram", "recall", "grid"}
                                      or not isinstance(block.props.get("source", ""), str)):
            raise DocumentError("Ungültiger Lernbaustein")
        if block.type in {"divider", "table", "media", "entity", "equation", "study"} and block.children:
            raise DocumentError(f"Baustein {block.type} darf keine Unterblöcke enthalten")
        _check_shape(block.children, depth + 1)


def validate(raw: "Document | dict | None") -> Document:
    if raw is None:
        return Document()
    try:
        document = raw if isinstance(raw, Document) else Document.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        place = ".".join(str(part) for part in first["loc"])
        raise DocumentError(f"Ungültige Notizstruktur ({place}): {first['msg']}") from exc
    _check_shape(document.blocks)
    blocks = list(walk(document.blocks))
    if len(blocks) > MAX_BLOCKS:
        raise DocumentError(f"Notiz darf höchstens {MAX_BLOCKS} Blöcke enthalten")
    seen: set[str] = set()
    for block in blocks:
        if block.id in seen:
            raise DocumentError("Block-IDs müssen eindeutig sein")
        seen.add(block.id)
    if len(to_text(document)) > MAX_TEXT_LENGTH:
        raise DocumentError("Notiztext darf höchstens 100.000 Zeichen enthalten")
    if len(canonical_json(document).encode()) > MAX_SERIALIZED_BYTES:
        raise DocumentError("Notiz ist zu groß")
    return document


def to_data(document: Document) -> dict:
    return document.model_dump(mode="json", exclude_none=True)


def canonical_json(document: Document) -> str:
    return json.dumps(to_data(document), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _inline_piece(item: Inline) -> str:
    if item.type == "wikilink":
        return f"[[{item.title}]]"
    if item.type == "math":
        return f"${item.latex or ''}$"
    text = f"`{item.text}`" if "code" in item.marks else item.text
    return f"[{text}]({item.href})" if item.href else text


def inline_text(content: list[Inline]) -> str:
    """Plain text with `[[links]]`, `[text](href)` and `code` kept visible for text scans."""
    return "".join(_inline_piece(item) for item in content)


def _cell_text(cell: Any) -> str:
    try:
        return inline_text([Inline.model_validate(item) for item in cell])
    except (ValidationError, TypeError):
        return ""


def block_text(block: Block) -> str:
    """Plain text of one block without its children; feeds search and assessment."""
    if block.type == "divider":
        return ""
    if block.type == "table":
        return "\n".join("\t".join(_cell_text(cell) for cell in row)
                         for row in block.props.get("rows", []) if isinstance(row, list))
    if block.type == "entity":
        return str(block.props.get("label", ""))
    if block.type == "media":
        return str(block.props.get("alt", ""))
    if block.type == "equation":
        return str(block.props.get("latex", ""))
    if block.type == "study":
        return str(block.props.get("source", ""))[:2000]
    if block.type == "code":
        return "```\n" + "".join(item.text for item in block.content) + "\n```"
    prefix = str(block.props.get("label", "")) + "\n" if block.type == "callout" and block.props.get("label") else ""
    return prefix + inline_text(block.content)


def to_text(document: Document) -> str:
    parts = [block_text(block) for block in walk(document.blocks)]
    return "\n".join(part for part in parts if part)


def _strip_ids(block: Block) -> str:
    data = block.model_dump(mode="json", exclude_none=True)

    def clean(value: dict) -> dict:
        value.pop("id", None)
        value["children"] = [clean(child) for child in value.get("children", [])]
        return value

    return json.dumps(clean(data), ensure_ascii=False, sort_keys=True)


def reuse_ids(document: Document, previous: Document | None) -> Document:
    """Carry block ids over from the previous revision so imports/CLI edits keep references stable."""
    if previous is None:
        return document
    pool: dict[str, list[str]] = {}
    for block in walk(previous.blocks):
        pool.setdefault(_strip_ids(block), []).append(block.id)
    used: set[str] = set()
    unmatched: set[int] = set()
    for block in walk(document.blocks):
        queue = pool.get(_strip_ids(block))
        if queue:
            block.id = queue.pop(0)
            used.add(block.id)
        else:
            unmatched.add(id(block))
    # Edited blocks at the same top-level position and type keep their identity.
    for index, block in enumerate(document.blocks):
        if id(block) in unmatched and index < len(previous.blocks):
            old = previous.blocks[index]
            if old.type == block.type and old.id not in used:
                block.id = old.id
                used.add(old.id)
    seen: set[str] = set()
    for block in walk(document.blocks):
        if block.id in seen:
            block.id = new_id()
        seen.add(block.id)
    return document


def link_first_mention(document: Document, title: str) -> bool:
    """Turn the first unlinked, non-code mention of `title` into a `[[title]]` link."""
    pattern = re.compile(r"(?<!\w)" + re.escape(title) + r"(?!\w)", re.IGNORECASE)
    for block in walk(document.blocks):
        if block.type in {"code", "equation"}:
            continue
        for index, item in enumerate(block.content):
            if item.type != "text" or "code" in item.marks or item.href:
                continue
            found = pattern.search(item.text)
            if found is None:
                continue
            before, after = item.text[:found.start()], item.text[found.end():]
            parts = [Inline(type="text", text=before, marks=item.marks) if before else None,
                     Inline(type="wikilink", title=title),
                     Inline(type="text", text=after, marks=item.marks) if after else None]
            block.content[index:index + 1] = [part for part in parts if part is not None]
            return True
    return False
