# SPDX-License-Identifier: AGPL-3.0-or-later
"""Persist the explicit assistant connection release."""

from app.db.models import AiAccess


def enable_connection(factory) -> None:
    with factory() as session:
        state = session.get(AiAccess, "mcp:enabled")
        if state is None:
            session.add(AiAccess(key="mcp:enabled", allowed=True))
        else:
            state.allowed = True
        session.commit()
