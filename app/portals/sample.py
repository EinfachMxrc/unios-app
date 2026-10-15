# SPDX-License-Identifier: AGPL-3.0-or-later

"""Create shareable portal page shapes with private CSS alias mappings."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import zlib
from dataclasses import dataclass, field
from secrets import token_hex

import keyring
from bs4 import BeautifulSoup, Comment, Doctype, NavigableString
from keyring.errors import KeyringError
from soupsieve import escape as css_escape

from app.portals.read_client import MAX_HTML_BYTES
from app.portals.session import (
    KEYRING_CHUNK_CHARS,
    MAX_KEYRING_CHUNKS,
    keyring_available,
)

SERVICE = "marc-uni-os:portal-selector-alias"
MAX_MAP_BYTES = 64_000
MAX_NODES = 20_000
SAFE_TAGS = frozenset({
    "a", "article", "aside", "b", "body", "br", "button", "caption", "dd", "details", "div",
    "dl", "dt", "em", "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3",
    "h4", "h5", "h6", "header", "html", "i", "label", "li", "main", "nav", "ol", "p",
    "section", "small", "span", "strong", "summary", "table", "tbody", "td", "th",
    "thead", "time", "tr", "ul",
})
REMOVE_TAGS = frozenset({
    "script", "style", "noscript", "iframe", "canvas", "svg", "object", "embed",
    "form", "input", "textarea", "select", "option", "meta", "link", "base", "template",
})
SAFE_ROLES = frozenset({"table", "row", "cell", "columnheader", "rowheader", "link", "button",
                        "heading", "list", "listitem", "main", "navigation", "region"})
ALIAS = re.compile(r"(?P<prefix>[.#])(?P<name>anon-[ci][0-9]+)(?![\w-])")
MAP_ID = re.compile(r"[0-9a-f]{16}")


class PortalSampleError(ValueError):
    """A sample cannot be exported without leaking source data."""


@dataclass
class AliasMap:
    portal: str
    map_id: str = field(default_factory=lambda: token_hex(8))
    aliases: dict[str, str] = field(default_factory=dict, repr=False)
    _reverse: dict[tuple[str, str], str] = field(default_factory=dict, repr=False)

    def alias(self, kind: str, original: str) -> str:
        if not original or len(original) > 200:
            raise PortalSampleError("Ungültiger Klassen- oder ID-Wert")
        key = (kind, original)
        if key not in self._reverse:
            value = f"anon-{kind}{1 + sum(alias.startswith(f'anon-{kind}') for alias in self.aliases)}"
            self._reverse[key] = value
            self.aliases[value] = original
        return self._reverse[key]


def anonymize_html(source: str, mapping: AliasMap) -> str:
    if len(source.encode("utf-8")) > MAX_HTML_BYTES:
        raise PortalSampleError("HTML-Datei ist zu groß")
    soup = BeautifulSoup(source, "html.parser")
    tags = list(soup.find_all(True))
    if len(tags) > MAX_NODES:
        raise PortalSampleError("HTML-Seite hat zu viele Elemente")
    for tag in tags:
        if tag.name in REMOVE_TAGS:
            tag.decompose()
            continue
        if tag.parent is None:
            continue
        if tag.name not in SAFE_TAGS:
            tag.name = "div"
        safe: dict[str, str] = {}
        classes = tag.get("class")
        if isinstance(classes, list):
            safe["class"] = " ".join(mapping.alias("c", str(item)) for item in classes)
        identifier = tag.get("id")
        if isinstance(identifier, str) and identifier:
            safe["id"] = mapping.alias("i", identifier)
        role = tag.get("role")
        if isinstance(role, str) and role in SAFE_ROLES:
            safe["role"] = role
        if tag.name == "a" and tag.has_attr("href"):
            safe["href"] = "#redacted"
        if tag.name == "time" and tag.has_attr("datetime"):
            safe["datetime"] = "REDACTED"
        tag.attrs.clear()
        tag.attrs.update(safe)
    for node in list(soup.descendants):
        if isinstance(node, (Comment, Doctype)):
            node.extract()
        elif isinstance(node, NavigableString) and node.strip():
            node.replace_with("Beispiel")
    result = str(soup)
    if len(result.encode("utf-8")) > MAX_HTML_BYTES:
        raise PortalSampleError("Anonymisierte Seite ist zu groß")
    return result


def save_alias_map(mapping: AliasMap) -> None:
    if mapping.portal not in {"primuss", "mycampus"} or not MAP_ID.fullmatch(mapping.map_id):
        raise PortalSampleError("Portal oder Alias-ID ist ungültig")
    if not keyring_available():
        raise PortalSampleError("Sicherer System-Schlüsselbund ist nicht verfügbar")
    payload = json.dumps(mapping.aliases, ensure_ascii=False)
    if len(payload.encode("utf-8")) > MAX_MAP_BYTES:
        raise PortalSampleError("Alias-Zuordnung ist zu groß")
    packed = base64.b64encode(zlib.compress(payload.encode("utf-8"), level=9)).decode("ascii")
    chunks = [packed[index:index + KEYRING_CHUNK_CHARS]
              for index in range(0, len(packed), KEYRING_CHUNK_CHARS)]
    if len(chunks) > MAX_KEYRING_CHUNKS:
        raise PortalSampleError("Alias-Zuordnung ist zu groß")
    account = f"{mapping.portal}:{mapping.map_id}"
    manifest = json.dumps({"version": 2, "chunks": len(chunks),
                           "sha256": hashlib.sha256(packed.encode("ascii")).hexdigest()})
    written: list[str] = []
    try:
        for index, chunk in enumerate(chunks):
            chunk_account = f"{account}:{index}"
            keyring.set_password(SERVICE, chunk_account, chunk)
            written.append(chunk_account)
            if keyring.get_password(SERVICE, chunk_account) != chunk:
                raise PortalSampleError("Alias-Zuordnung konnte nicht sicher gespeichert werden")
        keyring.set_password(SERVICE, account, manifest)
        if keyring.get_password(SERVICE, account) != manifest:
            raise PortalSampleError("Alias-Zuordnung konnte nicht sicher gespeichert werden")
    except (PortalSampleError, KeyringError, RuntimeError, OSError) as exc:
        for chunk_account in written:
            try:
                keyring.delete_password(SERVICE, chunk_account)
            except (keyring.errors.PasswordDeleteError, KeyringError, RuntimeError, OSError):
                pass
        raise PortalSampleError("Alias-Zuordnung konnte nicht sicher gespeichert werden") from exc


def load_alias_map(portal: str, map_id: str) -> dict[str, str] | None:
    if portal not in {"primuss", "mycampus"} or not MAP_ID.fullmatch(map_id) or not keyring_available():
        return None
    try:
        value = keyring.get_password(SERVICE, f"{portal}:{map_id}")
        payload = json.loads(value) if value and len(value.encode("utf-8")) <= MAX_MAP_BYTES else None
        if isinstance(payload, dict) and payload.get("version") == 2:
            count = payload.get("chunks")
            if not isinstance(count, int) or not 1 <= count <= MAX_KEYRING_CHUNKS:
                return None
            parts = [keyring.get_password(SERVICE, f"{portal}:{map_id}:{index}")
                     for index in range(count)]
            if any(part is None or len(part) > KEYRING_CHUNK_CHARS for part in parts):
                return None
            packed = "".join(part for part in parts if part is not None)
            if hashlib.sha256(packed.encode("ascii")).hexdigest() != payload.get("sha256"):
                return None
            decoder = zlib.decompressobj()
            raw = decoder.decompress(base64.b64decode(packed, validate=True), MAX_MAP_BYTES + 1)
            if len(raw) > MAX_MAP_BYTES or not decoder.eof or decoder.unconsumed_tail:
                return None
            payload = json.loads(raw)
    except (KeyringError, RuntimeError, OSError, ValueError, TypeError, zlib.error):
        return None
    if not isinstance(payload, dict) or any(
        not isinstance(key, str) or not re.fullmatch(r"anon-[ci][0-9]+", key)
        or not isinstance(item, str) or not item or len(item) > 200
        for key, item in payload.items()
    ):
        return None
    return payload


def resolve_selectors(selectors: dict[str, str | None], aliases: dict[str, str]) -> dict[str, str | None]:
    """Replace only CSS class/id aliases; never expose the original names in errors."""
    def replace(match: re.Match[str]) -> str:
        original = aliases.get(match.group("name"))
        if original is None:
            raise PortalSampleError("Selektor-Alias fehlt im lokalen Schlüsselbund")
        return match.group("prefix") + css_escape(original)

    return {key: ALIAS.sub(replace, value) if value is not None and key not in {
                "registered_text", "unregistered_text", "exam_key_attr", "grade_key_attr",
                "grade_status_passed", "grade_status_failed", "grade_status_open",
                "enrollment_key_attr", "enrollment_complete_text", "enrollment_open_text",
                "timetable_key_attr", "events_key_attr", "news_key_attr"} else value
            for key, value in selectors.items()}
