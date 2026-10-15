# SPDX-License-Identifier: AGPL-3.0-or-later

"""Validate a Moodle Mobile SSO callback before storing its token."""

import base64
import hashlib
import re
import secrets
from urllib.parse import unquote, urlparse

from moodle_dl.moodle.moodle_service import MoodleService


def decode_callback(callback: str) -> tuple[str, str]:
    parsed = urlparse(callback)
    if parsed.scheme not in {"marcunios", "moodledl", "moodlemobile", "forcedapp"}:
        raise ValueError("Keine Moodle-Mobile-Weiterleitung erkannt")
    prefix = parsed.scheme + "://token="
    if not callback.startswith(prefix):
        raise ValueError("Keine Moodle-Mobile-Weiterleitung erkannt")
    raw = unquote(callback[len(prefix):])
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", raw):
        raise ValueError("Token fehlt in der Weiterleitung")
    padded = raw + "=" * (-len(raw) % 4)
    decoded = base64.b64decode(padded, validate=True).decode("utf-8")
    site_id = decoded.split(":::", 1)[0]
    if not re.fullmatch(r"[a-f0-9]{32}", site_id) or ":::" not in decoded:
        raise ValueError("Ungültige Moodle-Mobile-Weiterleitung")
    result = MoodleService.extract_token("moodledl://token=" + padded)
    if not result or not result[0]:
        raise ValueError("moodle-dl konnte den Token nicht lesen")
    return site_id, result[0]


def token_from_callback(callback: str, passport: str, base_url: str) -> str:
    site_id, token = decode_callback(callback)
    expected = hashlib.md5((base_url + passport).encode()).hexdigest()
    if not secrets.compare_digest(site_id, expected):
        raise ValueError("Die Weiterleitung gehört nicht zu diesem Anmeldevorgang")
    return token
