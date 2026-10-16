# SPDX-License-Identifier: AGPL-3.0-or-later

"""Markdown at the edges: legacy revisions and imports become blocks, blocks export as Markdown."""

import json
import re
from collections.abc import Iterator

from app.notes.document import (
    Block,
    Document,
    Inline,
    new_id,
    reuse_ids,
    seeded_ids,
    validate,
)

ATTRIBUTE = re.compile(r'(\w+)="([^"]*)"')
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)")
HEADING = re.compile(r"^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
DIVIDER = re.compile(r"^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$")
ITEM = re.compile(r"^(\s*)([-*+]|\d{1,9}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$")
TABLE_RULE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$")
IMAGE = re.compile(r"^\s*!\[([^\]]*)\]\(([^()\s]+)(?:\s+\"[^\"]*\")?\)\s*$")
KNOWN_DIRECTIVES = {"entity", "media", "callout", "fold"}
DIRECTIVE = re.compile(r"^:::(\w+)\s*(\{.*?\})?\s*(:::)?\s*$")
INLINE = re.compile(
    r"\\(?P<esc>[\\`*_\[\]~|$])"
    r"|(?P<tick>`+)(?P<code>.+?)(?P=tick)"
    r"|\[\[(?P<wiki>[^\[\]\n]{1,200})\]\]"
    r"|\[(?P<label>[^\[\]]*)\]\((?P<href>[^()\s]*(?:\([^()]*\)[^()\s]*)*)\)"
    r"|\$(?![\s$])(?P<math>(?:\\.|[^$\n\\])+?)(?<!\s)\$(?![\d$])|\\\((?P<math2>[^\n]+?)\\\)"
    r"|==(?:\{(?P<hcolor>yellow|green|blue|pink)\})?(?P<hl>(?![\s={])(?:(?!==)[^\n])+?)==(?!=)"
    r"|\*\*(?P<bold>.+?)\*\*|__(?P<bold2>.+?)__|~~(?P<strike>.+?)~~"
    r"|\*(?P<italic>[^*\s](?:.*?[^*\s])?)\*"
    r"|(?<!\w)_(?P<italic2>[^_\s](?:.*?[^_\s])?)_(?!\w)", re.DOTALL)


def _attrs(raw: str | None) -> dict[str, str]:
    return {key: value.replace("&quot;", '"') for key, value in ATTRIBUTE.findall(raw or "")}


def parse_inline(text: str, marks: tuple[str, ...] = (), href: str | None = None,
                 color: str | None = None) -> list[Inline]:
    nodes: list[Inline] = []

    def emit(value: str, extra: tuple[str, ...] = ()) -> None:
        if not value:
            return
        combined = list(dict.fromkeys((*marks, *extra)))
        paint = color if "highlight" in combined else None
        last = nodes[-1] if nodes else None
        if last and last.type == "text" and last.marks == combined and last.href == href and last.color == paint:
            last.text += value
        else:
            nodes.append(Inline(type="text", text=value, marks=combined, href=href,  # type: ignore[arg-type]
                                color=paint))  # type: ignore[arg-type]

    position = 0
    for match in INLINE.finditer(text):
        emit(text[position:match.start()])
        position = match.end()
        if match["esc"]:
            emit(match["esc"])
        elif match["code"] is not None:
            emit(match["code"].strip() if match["code"].strip() else match["code"], ("code",))
        elif match["wiki"] is not None:
            nodes.append(Inline(type="wikilink", title=match["wiki"].strip()))
        elif match["label"] is not None:
            nodes.extend(parse_inline(match["label"] or match["href"], marks, match["href"], color))
        elif match["math"] is not None or match["math2"] is not None:
            nodes.append(Inline(type="math", latex=match["math"] or match["math2"]))
        elif match["hl"] is not None:
            nodes.extend(parse_inline(match["hl"], (*marks, "highlight"), href, match["hcolor"] or "yellow"))
        elif match["bold"] is not None or match["bold2"] is not None:
            nodes.extend(parse_inline(match["bold"] or match["bold2"], (*marks, "bold"), href, color))
        elif match["strike"] is not None:
            nodes.extend(parse_inline(match["strike"], (*marks, "strike"), href, color))
        else:
            nodes.extend(parse_inline(match["italic"] or match["italic2"], (*marks, "italic"), href, color))
    emit(text[position:])
    return nodes


def _block(kind: str, ids: Iterator[str], *, props: dict | None = None, content: list[Inline] | None = None,
           children: list[Block] | None = None) -> Block:
    return Block(id=next(ids), type=kind, props=props or {}, content=content or [],  # type: ignore[arg-type]
                 children=children or [])


def _starts_block(line: str) -> bool:
    return bool(FENCE.match(line) or HEADING.match(line) or DIVIDER.match(line) or ITEM.match(line)
                or line.lstrip().startswith(">") or line.startswith(":::") or line.strip().startswith(("$$", "\\["))
                or IMAGE.match(line))


def _cells(line: str) -> list[str]:
    stripped = line.strip().removeprefix("|").removesuffix("|")
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", stripped)]


def _directive(name: str, attrs: dict[str, str], ids: Iterator[str], lines: list[str]) -> Block:
    if name == "entity":
        try:
            entity_id = int(attrs.get("id", "0"))
        except ValueError:
            entity_id = 0
        return _block("entity", ids, props={"kind": attrs.get("kind", ""), "id": entity_id,
                                            "label": attrs.get("label", "")})
    if name == "media":
        return _block("media", ids, props={"kind": attrs.get("kind", "image"), "src": attrs.get("src", ""),
                                           "alt": attrs.get("alt", "")})
    if name == "fold":
        label = attrs.get("label", "")
        return _block("toggle", ids, content=[Inline(text=label)] if label else [],
                      children=_parse_lines(lines, ids))
    if name != "callout":
        # Unknown extensions stay visible as plain text instead of being guessed at.
        return _block("paragraph", ids, content=[Inline(text="\n".join(lines))] if lines else [])
    props = {"kind": attrs.get("kind", "note"), "label": attrs.get("label", "")}
    return _block("callout", ids, props=props, children=_parse_lines(lines, ids))


def _parse_lines(lines: list[str], ids: Iterator[str]) -> list[Block]:
    blocks: list[Block] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if fence := FENCE.match(line):
            marker, language = fence[1], fence[2]
            end = index + 1
            while end < len(lines) and not re.match(
                    r"^ {0,3}" + re.escape(marker[0]) + "{" + str(len(marker)) + r",}\s*$", lines[end]):
                end += 1
            code = "\n".join(lines[index + 1:end])
            study = re.fullmatch(r"unios-(diagram|recall|grid)", language)
            if study and end - index == 2:
                try:
                    source = json.loads(code).get("source")
                except (ValueError, AttributeError):
                    source = None
                if isinstance(source, str):
                    blocks.append(_block("study", ids, props={"kind": study[1], "source": source}))
                    index = end + 1
                    continue
            blocks.append(_block("code", ids, props={"language": language},
                                 content=[Inline(text=code)] if code else []))
            index = end + 1
        elif bracket := re.fullmatch(r"\s*\\\[(.+?)\\\]\s*", line):
            blocks.append(_block("equation", ids, props={"latex": bracket[1].strip()}))
            index += 1
        elif line.strip() == "\\[":
            end = index + 1
            while end < len(lines) and lines[end].strip() != "\\]":
                end += 1
            blocks.append(_block("equation", ids, props={"latex": "\n".join(lines[index + 1:end])}))
            index = end + 1
        elif single := re.fullmatch(r"\s*\$\$(?!\$)(.+?)\$\$\s*", line):
            blocks.append(_block("equation", ids, props={"latex": single[1].strip()}))
            index += 1
        elif line.strip() == "$$":
            end = index + 1
            while end < len(lines) and lines[end].strip() != "$$":
                end += 1
            blocks.append(_block("equation", ids, props={"latex": "\n".join(lines[index + 1:end])}))
            index = end + 1
        elif directive := DIRECTIVE.match(line):
            name, attrs, closed = directive[1], _attrs(directive[2]), directive[3]
            if name in {"entity", "media"} or closed:
                index += 1
                blocks.append(_directive(name, attrs, ids, [] if name in KNOWN_DIRECTIVES else [line]))
                continue
            depth, end = 1, index + 1
            while end < len(lines):
                if lines[end].strip() == ":::":
                    depth -= 1
                    if depth == 0:
                        break
                elif re.match(r"^:::\w", lines[end]) and not lines[end].rstrip().endswith(":::"):
                    depth += 1
                end += 1
            inner = lines[index + 1:end] if name in KNOWN_DIRECTIVES else lines[index:end + 1]
            blocks.append(_directive(name, attrs, ids, inner))
            index = end + 1
        elif heading := HEADING.match(line):
            blocks.append(_block("heading", ids, props={"level": len(heading[1])},
                                 content=parse_inline(heading[2])))
            index += 1
        elif DIVIDER.match(line):
            blocks.append(_block("divider", ids))
            index += 1
        elif image := IMAGE.match(line):
            blocks.append(_block("media", ids, props={"kind": "image", "src": image[2], "alt": image[1]}))
            index += 1
        elif "|" in line and index + 1 < len(lines) and TABLE_RULE.match(lines[index + 1]):
            rows = [_cells(line)]
            index += 2
            while index < len(lines) and lines[index].strip() and "|" in lines[index]:
                rows.append(_cells(lines[index]))
                index += 1
            width = len(rows[0])
            data = [[[item.model_dump(mode="json", exclude_none=True) for item in parse_inline(cell)]
                     for cell in (row + [""] * width)[:width]] for row in rows]
            blocks.append(_block("table", ids, props={"header": True, "rows": data}))
        elif line.lstrip().startswith(">"):
            quoted = []
            while index < len(lines) and lines[index].lstrip().startswith(">"):
                quoted.append(re.sub(r"^\s*>\s?", "", lines[index]))
                index += 1
            parsed = _parse_lines(quoted, ids)
            first = parsed[0] if parsed and parsed[0].type == "paragraph" else None
            blocks.append(_block("quote", ids, content=first.content if first else [],
                                 children=parsed[1:] if first else parsed))
        elif ITEM.match(line):
            index = _consume_list(lines, index, ids, blocks)
        else:
            paragraph = [line.strip()]
            index += 1
            while index < len(lines) and lines[index].strip() and not _starts_block(lines[index]):
                paragraph.append(lines[index].strip())
                index += 1
            blocks.append(_block("paragraph", ids, content=parse_inline("\n".join(paragraph))))
    return blocks


def _consume_list(lines: list[str], index: int, ids: Iterator[str], out: list[Block]) -> int:
    stack: list[tuple[int, Block]] = []
    while index < len(lines):
        match = ITEM.match(lines[index])
        if not match:
            if lines[index].strip() and stack and lines[index].startswith(" ") and not _starts_block(lines[index]):
                last = stack[-1][1]
                last.content = parse_inline(
                    "\n".join([render_inline(last.content), lines[index].strip()]))
                index += 1
                continue
            break
        indent = len(match[1].expandtabs(4))
        marker, task = match[2], match[3]
        kind = "numbered" if marker[0].isdigit() else "todo" if task is not None else "bullet"
        props = {"checked": task.lower() == "x"} if task is not None else {}
        item = _block(kind, ids, props=props, content=parse_inline(match[4]))
        while stack and stack[-1][0] >= indent:
            stack.pop()
        (stack[-1][1].children if stack else out).append(item)
        stack.append((indent, item))
        index += 1
    return index


def parse_markdown(body: str, *, previous: Document | None = None, seed: str | None = None) -> Document:
    lines = body.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    ids = seeded_ids(seed) if seed else iter(new_id, None)
    document = Document(blocks=_parse_lines(lines, ids))
    return validate(reuse_ids(document, previous))


def _escape(text: str) -> str:
    text = re.sub(r"([\\`*_~|$])", r"\\\1", text)
    return re.sub(r"\[(?=\[)|\](?=\()", lambda match: "\\" + match[0], text)


def render_inline(content: list[Inline]) -> str:
    out = []
    for node in content:
        if node.type == "wikilink":
            out.append(f"[[{node.title}]]")
            continue
        if node.type == "math":
            out.append(f"${node.latex or ''}$")
            continue
        text = node.text
        if "code" in node.marks:
            fence = "`" * (max((len(run) for run in re.findall(r"`+", text)), default=0) + 1)
            text = f"{fence} {text} {fence}" if text.startswith("`") or text.endswith("`") else f"{fence}{text}{fence}"
        else:
            text = _escape(text)
        for mark, wrap in (("strike", "~~"), ("italic", "*"), ("bold", "**")):
            if mark in node.marks and text.strip():
                text = f"{wrap}{text}{wrap}"
        if "highlight" in node.marks and text.strip():
            text = f"=={{{node.color}}}{text}==" if node.color and node.color != "yellow" else f"=={text}=="
        if node.href:
            text = f"[{text}]({node.href})"
        out.append(text)
    return "".join(out)


def _attr_string(**values: object) -> str:
    return " ".join(f'{key}="{str(value).replace(chr(34), "&quot;")}"' for key, value in values.items())


def _cell_markdown(cell: object) -> str:
    try:
        return render_inline([Inline.model_validate(item) for item in cell]).replace("\n", " ")  # type: ignore[attr-defined]
    except (TypeError, ValueError):
        return ""


def _render(blocks: list[Block], depth: int = 0) -> list[str]:
    out: list[str] = []
    numbered = 0
    pad = "  " * depth
    for block in blocks:
        numbered = numbered + 1 if block.type == "numbered" else 0
        text = render_inline(block.content)
        lines: list[str]
        if block.type == "heading":
            lines = [f"{'#' * int(block.props.get('level', 1))} {text}"]
        elif block.type == "bullet":
            lines = [f"{pad}- {text}"]
        elif block.type == "toggle":
            label = "".join(item.text or item.title or "" for item in block.content)
            lines = [f":::fold {{{_attr_string(label=label)}}}" if label else ":::fold", "",
                     *_render(block.children), "", ":::"]
        elif block.type == "numbered":
            lines = [f"{pad}{numbered}. {text}"]
        elif block.type == "todo":
            lines = [f"{pad}- [{'x' if block.props.get('checked') else ' '}] {text}"]
        elif block.type == "quote":
            inner = ([text] if text else []) + ([""] if text and block.children else []) + _render(block.children)
            lines = [f"> {line}" if line else ">" for line in "\n".join(inner).split("\n")]
        elif block.type == "callout":
            attributes = {"kind": block.props.get("kind", "note"), **({"label": block.props["label"]} if block.props.get("label") else {})}
            head = f":::callout {{{_attr_string(**attributes)}}}"
            inner = ([text, ""] if text else []) + _render(block.children)
            lines = [head, "", *inner, "", ":::"]
        elif block.type == "code":
            code = "".join(item.text for item in block.content)
            fence = "`" * max(3, max((len(run) for run in re.findall(r"`+", code)), default=0) + 1)
            lines = [f"{fence}{block.props.get('language', '')}", code, fence]
        elif block.type == "divider":
            lines = ["---"]
        elif block.type == "study":
            payload = json.dumps({"source": str(block.props.get("source", ""))}, ensure_ascii=False)
            lines = [f"```unios-{block.props.get('kind', 'recall')}", payload, "```"]
        elif block.type == "equation":
            lines = ["$$", str(block.props.get("latex", "")), "$$"]
        elif block.type == "entity":
            lines = [f":::entity {{{_attr_string(kind=block.props.get('kind', ''), id=block.props.get('id', 0), label=block.props.get('label', ''))}}} :::"]
        elif block.type == "media":
            lines = [f":::media {{{_attr_string(src=block.props.get('src', ''), kind=block.props.get('kind', 'image'), alt=block.props.get('alt', ''))}}} :::"]
        elif block.type == "table":
            rows = [[_cell_markdown(cell) for cell in row] for row in block.props.get("rows", []) if isinstance(row, list)]
            if rows:
                lines = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join("---" for _ in rows[0]) + " |",
                         *("| " + " | ".join(row) + " |" for row in rows[1:])]
            else:
                lines = []
        else:
            lines = [text]
        listed = block.type in {"bullet", "numbered", "todo"}
        out.extend(lines)
        if listed:
            out.extend(_render(block.children, depth + 1))
        elif block.children and block.type not in {"quote", "callout", "toggle"}:
            out.extend(_render(block.children, depth))
        out.append("" if not listed else "\u0000")
    return out


def render_markdown(document: Document) -> str:
    """Lossy-by-design export view (underline, highlight and toggles have no Markdown form)."""
    raw = _render(document.blocks)
    lines: list[str] = []
    for index, line in enumerate(raw):
        if line == "\u0000":
            following = next((item for item in raw[index + 1:] if item != "\u0000"), "")
            if following.lstrip().startswith(("-", "+")) or re.match(r"\s*\d+\.", following):
                continue
            lines.append("")
        else:
            lines.append(line)
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip("\n")
