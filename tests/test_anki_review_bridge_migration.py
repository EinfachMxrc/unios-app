# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic historical databases preserve review identity and foreign keys."""

from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.db.models import AnkiReview
from app.db.session import make_engine

PREVIOUS_SCHEMA = "ff97d2a90616"  # pragma: allowlist secret -- public schema ID
BRIDGE_SCHEMA = "ff98c7da0320"  # pragma: allowlist secret -- public schema ID
LEGACY_REVIEWS = [
    (9, 8, "2026-01-01 00:00:00", 3),
    (10, 8, "2026-01-02 00:00:00", 1),
]


def _historical_database(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, PREVIOUS_SCHEMA)
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO anki_card_queue(id,status,payload) VALUES(7,'pushed','{}')"))
        connection.execute(text("INSERT INTO anki_cards(id,queue_id,note_id) VALUES(8,7,'123456')"))
        connection.execute(text("INSERT INTO anki_reviews(id,card_id,reviewed_at,rating) "
                                "VALUES(:id,:card_id,:reviewed_at,:rating)"),
                           [{"id": row[0], "card_id": row[1], "reviewed_at": row[2], "rating": row[3]}
                            for row in LEGACY_REVIEWS])
        root_pages = connection.execute(text("SELECT name,rootpage FROM sqlite_master "
                                              "WHERE type='table' AND name IN "
                                              "('anki_card_queue','anki_cards','anki_reviews') "
                                              "ORDER BY name")).all()
    engine.dispose()
    return config, root_pages


def test_upgrade_is_additive_and_preserves_legacy_rows_and_card_foreign_keys(settings, coordinator):
    config, root_pages = _historical_database(settings, coordinator)
    command.upgrade(config, BRIDGE_SCHEMA)
    engine = make_engine(settings, coordinator)
    with engine.connect() as connection:
        assert [tuple(row) for row in connection.execute(text(
            "SELECT id,card_id,reviewed_at,rating FROM anki_reviews ORDER BY id"))] == LEGACY_REVIEWS
        assert connection.execute(text("SELECT review_id FROM anki_reviews ORDER BY id")).scalars().all() == [None, None]
        assert tuple(connection.execute(text("SELECT id,queue_id,note_id FROM anki_cards")).one()) == (8, 7, "123456")
        assert connection.execute(text("SELECT name,rootpage FROM sqlite_master "
                                        "WHERE type='table' AND name IN "
                                        "('anki_card_queue','anki_cards','anki_reviews') "
                                        "ORDER BY name")).all() == root_pages
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        review_column = next(column for column in inspect(connection).get_columns("anki_reviews")
                             if column["name"] == "review_id")
        assert review_column["nullable"]
        assert review_column["type"].length == 100
        assert {"name": "ix_anki_reviews_review_id", "column_names": ["review_id"], "unique": 1,
                "dialect_options": {}} in inspect(connection).get_indexes("anki_reviews")
    engine.dispose()


def test_review_identity_allows_multiple_legacy_nulls_but_rejects_replay_duplicates(settings, coordinator):
    config, _ = _historical_database(settings, coordinator)
    command.upgrade(config, BRIDGE_SCHEMA)
    engine = make_engine(settings, coordinator)
    statement = text("INSERT INTO anki_reviews(card_id,reviewed_at,rating,review_id) "
                     "VALUES(8,'2026-01-03 00:00:00',2,:review_id)")
    with engine.begin() as connection:
        connection.execute(statement, [{"review_id": None}, {"review_id": None}, {"review_id": "stable-review-1"}])
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(statement, {"review_id": "stable-review-1"})
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM anki_reviews WHERE review_id IS NULL")).scalar_one() == 4
        assert connection.execute(text("SELECT count(*) FROM anki_reviews WHERE review_id='stable-review-1'")) \
            .scalar_one() == 1
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()


def test_synthetic_downgrade_and_reupgrade_keep_historical_reviews_and_primary_keys(settings, coordinator):
    config, _ = _historical_database(settings, coordinator)
    command.upgrade(config, BRIDGE_SCHEMA)
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO anki_reviews(id,card_id,reviewed_at,rating,review_id) "
                                "VALUES(11,8,'2026-01-03 00:00:00',4,'stable-review-1')"))
    engine.dispose()
    command.downgrade(config, PREVIOUS_SCHEMA)
    command.upgrade(config, BRIDGE_SCHEMA)
    engine = make_engine(settings, coordinator)
    with engine.connect() as connection:
        assert [tuple(row) for row in connection.execute(text(
            "SELECT id,card_id,reviewed_at,rating FROM anki_reviews ORDER BY id"))] \
            == [*LEGACY_REVIEWS, (11, 8, "2026-01-03 00:00:00", 4)]
        assert connection.execute(text("SELECT review_id FROM anki_reviews ORDER BY id")).scalars().all() \
            == [None, None, None]
        assert tuple(connection.execute(text("SELECT id,queue_id,note_id FROM anki_cards")).one()) == (8, 7, "123456")
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()


def test_orm_review_identity_matches_additive_schema():
    column = AnkiReview.__table__.c.review_id
    assert column.nullable
    assert column.type.length == 100
    assert column.unique
    assert column.index
