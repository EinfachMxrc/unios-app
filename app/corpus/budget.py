# SPDX-License-Identifier: AGPL-3.0-or-later
"""Model-independent conservative payload budget, including canonical JSON metadata."""

import json
from copy import deepcopy

from fastapi import HTTPException


def encoded(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), default=str).encode('utf-8')


def fit(payload: dict, budget: int, list_keys: tuple[str, ...] = ()) -> dict:
    payload = deepcopy(payload)
    payload['budget'] = {'limit': budget, 'used': 0, 'unit': 'utf8_bytes_token_upper_bound',
                         'scope': 'canonical_json_payload'}
    payload['truncated'] = payload.get('truncated', False)
    while True:
        # Fixed point: the size includes its own decimal size field.
        for _ in range(8):
            size = len(encoded(payload))
            if size == payload['budget']['used']:
                break
            payload['budget']['used'] = size
        if len(encoded(payload)) <= budget:
            return payload
        removed = False
        for key in list_keys:
            if payload.get(key):
                payload[key].pop()
                removed = True
                break
        if not removed:
            raise HTTPException(422, 'Budget zu klein für die Antwort-Metadaten')
        payload['truncated'] = True
