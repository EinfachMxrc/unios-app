# SPDX-License-Identifier: AGPL-3.0-or-later
"""Opaque signed cursors bound to corpus incarnation, actor, permissions and query."""

import base64
import json
from hashlib import sha256
from hmac import compare_digest, new

from fastapi import HTTPException


def seal(data: dict, secret: str) -> str:
    raw = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
    signature = new(secret.encode(), raw, sha256).digest()
    return base64.urlsafe_b64encode(raw + signature).decode().rstrip('=')


def unseal(cursor: str, secret: str, expected: dict) -> dict:
    try:
        data = base64.b64decode(cursor + '=' * (-len(cursor) % 4), altchars=b'-_', validate=True)
        raw, signature = data[:-32], data[-32:]
        if not compare_digest(signature, new(secret.encode(), raw, sha256).digest()):
            raise ValueError
        result = json.loads(raw)
        if not isinstance(result, dict) or any(result.get(key) != value for key, value in expected.items()):
            raise ValueError
        if type(result.get('position')) is not int or result['position'] < 0:
            raise ValueError
        return result
    except (ValueError, TypeError, UnicodeError):
        raise HTTPException(409, 'Cursor ungültig oder Rechte/Index geändert; erneut starten') from None
