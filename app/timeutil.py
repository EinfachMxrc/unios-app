# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared helper for a pattern copied across the codebase: SQLite drops the
tzinfo of a ``DateTime(timezone=True)`` column on read, so any naive value
coming back from the database has to be treated as UTC before it is compared
with, or converted to, another timezone."""

from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """Return ``value`` as an aware UTC datetime.

    A naive ``value`` is assumed to already represent UTC (this project only
    ever stores UTC instants), matching the ``x if x.tzinfo else
    x.replace(tzinfo=UTC)`` idiom this helper replaces.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
