# SPDX-License-Identifier: AGPL-3.0-or-later
from sqlalchemy import select

from app.db.models import SyncRun


def latest_sync_status(factory) -> tuple[int | None, str | None]:
    with factory() as session:
        latest = session.scalar(select(SyncRun).order_by(SyncRun.id.desc()).limit(1))
        return (latest.id, latest.status) if latest else (None, None)
