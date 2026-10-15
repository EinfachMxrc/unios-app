# SPDX-License-Identifier: AGPL-3.0-or-later

"""Database access for non-secret runtime preferences."""

from app.db.models import RuntimePreference, utc_now


class RuntimeRepository:
    def __init__(self, factory):
        self.factory = factory

    def read(self) -> RuntimePreference | None:
        with self.factory() as session:
            return session.get(RuntimePreference, 1)

    def save(self, values: dict, expected_revision: int) -> RuntimePreference | None:
        with self.factory() as session:
            row = session.get(RuntimePreference, 1)
            if (row.revision if row else 0) != expected_revision:
                return None
            if row is None:
                row = RuntimePreference(id=1, values=values, revision=1, updated_at=utc_now())
                session.add(row)
            else:
                row.values = values
                row.revision += 1
                row.updated_at = utc_now()
            session.commit()
            return row
