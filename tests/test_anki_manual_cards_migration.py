# SPDX-License-Identifier: AGPL-3.0-or-later
"""Only synthetic historical databases exercise the additive card migration."""

from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.db.session import make_engine


def _historical_database(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "ff96c1980515")
    payload = '{ "front": "Legacy & <T>", "back": "Unchanged", "confidence": "high" }'
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO anki_card_queue(id, status, payload) VALUES(7,'approved',:payload)"),
                           {"payload": payload})
        connection.execute(text("INSERT INTO anki_cards(id,queue_id,note_id) VALUES(8,7,'123456')"))
        connection.execute(text("INSERT INTO anki_reviews(id,card_id,reviewed_at,rating) "
                                "VALUES(9,8,'2026-01-01 00:00:00',3)"))
    engine.dispose()
    return config, payload


def test_upgrade_preserves_existing_payload_mapping_reviews_and_ai_default(settings, coordinator):
    config, payload = _historical_database(settings, coordinator)
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        old = connection.execute(text("SELECT id,payload,origin,mutation_id,source_version_id,source_snapshot "
                                       "FROM anki_card_queue WHERE id=7")).one()
        assert tuple(old) == (7, payload, "ai", None, None, None)
        assert tuple(connection.execute(text("SELECT id,queue_id,note_id FROM anki_cards")).one()) == (8, 7, "123456")
        assert tuple(connection.execute(text("SELECT id,card_id,rating FROM anki_reviews")).one()) == (9, 8, 3)
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        connection.execute(text("INSERT INTO anki_card_queue(status,payload) VALUES('proposed','{}')"))
        assert connection.execute(text("SELECT origin FROM anki_card_queue WHERE id>7")).scalar_one() == "ai"
    engine.dispose()


def test_unique_mutation_and_source_foreign_key_are_enforced_after_upgrade(settings, coordinator):
    config, _ = _historical_database(settings, coordinator)
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO anki_card_queue(status,payload,origin,mutation_id) "
                                "VALUES('approved','{}','manual',:mutation)"),
                           {"mutation": "00000000-0000-4000-8000-000000000123"})
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text("INSERT INTO anki_card_queue(status,payload,origin,mutation_id) "
                                "VALUES('approved','{}','manual',:mutation)"),
                           {"mutation": "00000000-0000-4000-8000-000000000123"})
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text("INSERT INTO anki_card_queue(status,payload,source_version_id) "
                                "VALUES('approved','{}',999999)"))
    engine.dispose()


def test_synthetic_downgrade_and_reupgrade_preserve_legacy_reviews(settings, coordinator):
    config, payload = _historical_database(settings, coordinator)
    command.upgrade(config, "head")
    command.downgrade(config, "ff96c1980515")
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT payload FROM anki_card_queue WHERE id=7")).scalar_one() == payload
        assert connection.execute(text("SELECT count(*) FROM anki_reviews WHERE card_id=8")).scalar_one() == 1
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()
