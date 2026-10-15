# SPDX-License-Identifier: AGPL-3.0-or-later
"""Deduplicated mail metadata, without storing bodies or attachments."""

from sqlalchemy import select

from app.db.models import MailItem
from app.mail.ingest import ParsedMail


class MailRepository:
    def __init__(self, factory):
        self.factory = factory

    def import_rows(self, rows: list[ParsedMail], coordinator) -> int:
        with self.factory() as session:
            created = 0
            for parsed in rows:
                if session.scalar(select(MailItem.id).where(MailItem.source_hash == parsed.source_hash)):
                    continue
                session.add(MailItem(source_hash=parsed.source_hash, sender=parsed.sender,
                                     subject=parsed.subject, received_at=parsed.received_at,
                                     candidate_date=parsed.candidate_date,
                                     status="proposed" if parsed.candidate_date else "info"))
                created += 1
            coordinator.assert_writer()
            session.commit()
            return created
