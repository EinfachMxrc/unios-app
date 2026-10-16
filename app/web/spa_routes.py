# SPDX-License-Identifier: AGPL-3.0-or-later

"""Paths of the React app, so a reload or deep link gets index.html instead of a 404.

Mirrors ``frontend/src/components/sidebarCatalog.ts`` (``areaDefinitions``) and the
extra routes in ``App.tsx``. ``tests/test_spa_routes.py`` lists every frontend route.
"""

import re

STATIC_ROUTES = frozenset({
    "/", "/activity", "/addons", "/ai", "/analytics", "/anki", "/assessment", "/campus", "/coding",
    "/collections", "/courses", "/deadlines", "/digest", "/drop", "/exercises", "/explanations", "/grades",
    "/import", "/inbox", "/jobs", "/jots", "/journal", "/learning", "/mail", "/marketplace", "/mensa", "/more",
    "/notes", "/notifications", "/projects", "/rooms", "/rules", "/search", "/settings", "/setup", "/study",
    "/study/cards", "/system", "/trash", "/university-documents", "/voice", "/welcome", "/workspace/new",
})

# One segment each, as React Router matches them; numeric ids stay numeric.
DYNAMIC_ROUTES = tuple(re.compile(pattern) for pattern in (
    r"/courses/\d+",
    r"/material/\d+",
    r"/document/\d+",
    r"/projects/\d+",
    r"/addons/[^/]+",
    r"/journal/[^/]+",
    r"/study/session/[^/]+",
    r"/learning/focus/[^/]+/[^/]+",
))


def is_react_route(path: str) -> bool:
    return path in STATIC_ROUTES or any(pattern.fullmatch(path) for pattern in DYNAMIC_ROUTES)
