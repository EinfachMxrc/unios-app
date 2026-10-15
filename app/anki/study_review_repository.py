# SPDX-License-Identifier: AGPL-3.0-or-later

"""SQL lookup and atomic persistence for stable review bindings."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AnkiCard, AnkiCardQueue, AnkiReview
from app.db.session import begin_write_transaction


class ReviewMirrorRepository:
    def __init__(self, factory: Callable[[], Session]):
        self._factory = factory

    @contextmanager
    def transaction(self, *, write: bool = False, write_guard: Callable[[], None] | None = None) -> Iterator[Session]:
        with self._factory() as session:
            if write:
                if write_guard is not None:
                    write_guard()
                begin_write_transaction(session)
            yield session
            if write:
                if write_guard is not None:
                    write_guard()
                session.commit()

    def manual_queue(self, session: Session, mutation_id: str) -> AnkiCardQueue | None:
        return session.scalar(select(AnkiCardQueue).where(AnkiCardQueue.origin == "manual",
                                                         AnkiCardQueue.mutation_id == mutation_id))

    def queue(self, session: Session, queue_id: int) -> AnkiCardQueue | None:
        return session.get(AnkiCardQueue, queue_id)

    def bindings(self, session: Session, queue_id: int) -> list[AnkiCard]:
        return list(session.scalars(select(AnkiCard).where(AnkiCard.queue_id == queue_id)).all())

    def note_binding(self, session: Session, note_id: str) -> AnkiCard | None:
        return session.scalar(select(AnkiCard).where(AnkiCard.note_id == note_id))

    def review(self, session: Session, review_id: str) -> AnkiReview | None:
        return session.scalar(select(AnkiReview).where(AnkiReview.review_id == review_id))

    def reviews_at(self, session: Session, card_id: int, reviewed_at: datetime) -> list[AnkiReview]:
        return list(session.scalars(select(AnkiReview).where(AnkiReview.card_id == card_id,
                                                            AnkiReview.reviewed_at == reviewed_at)).all())

    def bind(self, session: Session, queue: AnkiCardQueue, note_id: str,
             previous: AnkiCard | None) -> AnkiCard:
        if previous is None:
            previous = AnkiCard(queue_id=queue.id, note_id=note_id)
            session.add(previous)
        else:
            previous.note_id = note_id
        queue.status = "pushed"
        session.flush()
        return previous

    def add_review(self, session: Session, card_id: int, reviewed_at: datetime, rating: int,
                   review_id: str | None = None) -> None:
        session.add(AnkiReview(card_id=card_id, reviewed_at=reviewed_at, rating=rating, review_id=review_id))

    def acknowledge_review(self, review: AnkiReview, review_id: str) -> None:
        review.review_id = review_id

    def remove_review(self, session: Session, review: AnkiReview) -> None:
        session.delete(review)
