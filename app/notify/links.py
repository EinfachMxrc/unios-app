# SPDX-License-Identifier: AGPL-3.0-or-later

"""Build dashboard links only for addresses another device can actually reach."""

from app.config import RemoteAddressNotConfigured, Settings


def dashboard_link(settings: Settings, path: str) -> str:
    """Raises ``RemoteAddressNotConfigured`` rather than linking to 127.0.0.1."""
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("Dashboard-Pfad muss intern sein")
    return f"{settings.remote_base_url()}{path}"


def dashboard_link_or_notice(settings: Settings, path: str) -> str:
    """Like ``dashboard_link``, but degrades instead of raising.

    For composing a stored notification body: a half-written sync run or
    digest (the caller crashing mid-way) would be worse than a message that
    honestly says no remote address is set up yet.
    """
    try:
        return dashboard_link(settings, path)
    except RemoteAddressNotConfigured:
        return "(kein Fernzugriff eingerichtet – in der App öffnen)"
