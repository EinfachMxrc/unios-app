# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared request-origin and Host-header checks for the local API.

Used both by the cross-site write gate in ``app.main`` and by the narrow set
of MCP read routes that must stay reachable from the dashboard without a
token (``app.ai.mcp_api``), so the two guards cannot silently drift apart.
"""

from urllib.parse import urlparse

from fastapi import Request

LOCAL_PREVIEW_ORIGINS = frozenset({
    "http://127.0.0.1:5173", "http://localhost:5173",
    "http://127.0.0.1:4173", "http://localhost:4173",
    "http://127.0.0.1:4178", "http://localhost:4178",
})


def is_dashboard_request(request: Request) -> bool:
    """True unless the request looks like a cross-site browser call.

    Rejects a request the browser itself flagged ``Sec-Fetch-Site: cross-site``,
    and rejects any ``Origin`` whose netloc does not match the ``Host`` header,
    except for the local Vite dev/preview server proxying to the API from a
    loopback peer. A request without an ``Origin`` header (a plain same-origin
    fetch, or a non-browser client such as the local MCP process) is treated
    as a dashboard request.
    """
    if request.headers.get("sec-fetch-site") == "cross-site":
        return False
    origin = request.headers.get("origin")
    if not origin:
        return True
    local_preview = (origin in LOCAL_PREVIEW_ORIGINS
                     and request.client is not None and request.client.host in {"127.0.0.1", "::1"})
    return urlparse(origin).netloc == request.headers.get("host") or local_preview


def extract_hostname(host_header: str) -> str:
    """Strip the port (and IPv6 brackets) from a raw ``Host`` header value."""
    value = host_header.strip()
    if value.startswith("["):
        end = value.find("]")
        return value[1:end] if end != -1 else value[1:]
    return value.split(":", 1)[0]


def private_cache_control(path: str, status: int, content_type: str) -> str:
    """Only validated public meal images may enter a browser's private cache."""
    if (path == '/api/mensa/image' and status == 200
            and content_type.split(';', 1)[0] in {'image/jpeg', 'image/png', 'image/webp'}):
        return 'private, max-age=86400'
    return 'private, no-store'
