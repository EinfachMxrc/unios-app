# SPDX-License-Identifier: AGPL-3.0-or-later
"""Short SQLite write transactions, committed before provider I/O.

Pending/uncertain claims survive process death and never expire automatically:
a timeout is not evidence that the provider did not bill the request.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.models import AiBudgetReservation, AiUsage


def committed_tokens(session, month: str) -> int:
    return int(session.scalar(select(func.coalesce(func.sum(AiUsage.tokens_used), 0))
                              .where(AiUsage.month == month)) or 0)


def reserved_tokens(session, month: str) -> int:
    return int(session.scalar(select(func.coalesce(func.sum(AiBudgetReservation.tokens), 0))
                              .where(AiBudgetReservation.month == month,
                                     AiBudgetReservation.state.in_(['pending', 'uncertain']))) or 0)


class BudgetRepository:
    def __init__(self, bind):
        self.bind = bind

    def reserve(self, month: str, model: str, tokens: int, limit: int | None, now: datetime) -> str | None:
        with Session(self.bind) as session:
            session.execute(text('BEGIN IMMEDIATE'))
            if limit is not None and committed_tokens(session, month) + reserved_tokens(session, month) + tokens > limit:
                return None
            claim = AiBudgetReservation(id=str(uuid4()), month=month, model=model, tokens=tokens,
                                        state='pending', created_at=now)
            session.add(claim)
            session.commit()
            return claim.id

    def finish(self, claim_id: str, model: str, tokens: int | None, *, not_sent=False) -> None:
        with Session(self.bind) as session:
            session.execute(text('BEGIN IMMEDIATE'))
            claim = session.get(AiBudgetReservation, claim_id)
            if claim is None or claim.state != 'pending':
                return  # Settlement is idempotent; an uncertain charge is never silently released.
            if not_sent:
                claim.state = 'released'
            elif tokens is None:
                claim.state = 'uncertain'
            else:
                row = session.scalar(select(AiUsage).where(AiUsage.month == claim.month, AiUsage.model == model))
                if row is None:
                    session.add(AiUsage(month=claim.month, model=model, tokens_used=max(0, tokens)))
                else:
                    row.tokens_used += max(0, tokens)
                claim.state = 'settled'
            session.commit()
