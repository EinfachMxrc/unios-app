# SPDX-License-Identifier: AGPL-3.0-or-later

import datetime
import json
import shutil
import sqlite3
from pathlib import Path

# Application imports are side-effect free. Fixtures always pass explicit
# settings without a developer's .env, study directory or credential store.
import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url

from app.config import Settings
from app.db.models import Base
from app.db.session import make_session_factory
from app.host.lease import HostCoordinator

FIXTURES = Path(__file__).parent / "fixtures" / "moodle"

# A few tests bind a raw ``datetime`` straight into a ``text()`` SQL statement
# (staging fixture rows for a migration test), which makes the sqlite3 DBAPI
# fall back to its default adapter and emit "The default datetime adapter is
# deprecated as of Python 3.12". Registering the same conversion explicitly
# keeps the stored format identical and silences the warning.
sqlite3.register_adapter(datetime.date, lambda value: value.isoformat())
sqlite3.register_adapter(datetime.datetime, lambda value: value.isoformat(" "))


def read_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, moodle_base_url="https://moodle.example.invalid", moodle_token="fixture-token",
                    institution_slug="hs-coburg",
                    public_periods_enabled=False,
                    server_mode=False, ntfy_url="", discord_webhook_url="",
                    data_dir=tmp_path / "shared", local_dir=tmp_path / "private", request_delay_seconds=0,
                    allowed_hosts="127.0.0.1,localhost,[::1],testserver", api_auth_required=False)


@pytest.fixture
def coordinator(settings):
    host = HostCoordinator(settings)
    host.acquire_initial()
    assert host.start()
    yield host
    host.close()


def _stamp_current_schema(engine) -> None:
    """Mark the freshly created tables with the real Alembic head.

    Tests build their schema via ``Base.metadata.create_all`` instead of
    running migrations, so without this the database has no
    ``alembic_version`` row at all. Code that checks the stamped schema
    version (e.g. host handoff's snapshot compatibility check, or the
    feedback diagnostics endpoint) must still see a valid, current version
    here, the same as any real, migrated database would have.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    head = ScriptDirectory.from_config(config).get_current_head()
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"))
        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(text("INSERT INTO alembic_version VALUES (:version)"), {"version": head})


def _create_test_schema(engine):
    Base.metadata.create_all(engine)
    from app.assessment.index_schema import install as install_assessment_index
    from app.coding.index_schema import install as install_coding_index
    from app.corpus.incremental_schema import install as install_incremental
    from app.corpus.schema_v1 import install as install_corpus
    with engine.begin() as connection:
        install_corpus(connection)
        install_incremental(connection)
        install_coding_index(connection)
        install_assessment_index(connection)
    _stamp_current_schema(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE VIRTUAL TABLE material_annotations_fts USING "
                                "fts5(quote, comment, content='material_annotations', content_rowid='rowid')"))
        connection.execute(text("CREATE TRIGGER material_annotations_ai AFTER INSERT ON material_annotations BEGIN "
                                "INSERT INTO material_annotations_fts(rowid, quote, comment) "
                                "VALUES (new.rowid, new.quote, new.comment); END"))
        connection.execute(text("CREATE TRIGGER material_annotations_ad AFTER DELETE ON material_annotations BEGIN "
                                "INSERT INTO material_annotations_fts(material_annotations_fts, rowid, quote, comment) "
                                "VALUES ('delete', old.rowid, old.quote, old.comment); END"))
        connection.execute(text("CREATE TRIGGER material_annotations_au AFTER UPDATE ON material_annotations BEGIN "
                                "INSERT INTO material_annotations_fts(material_annotations_fts, rowid, quote, comment) "
                                "VALUES ('delete', old.rowid, old.quote, old.comment); "
                                "INSERT INTO material_annotations_fts(rowid, quote, comment) "
                                "VALUES (new.rowid, new.quote, new.comment); END"))
        connection.execute(text("CREATE VIRTUAL TABLE course_scratchpads_fts USING "
                                "fts5(body, content='course_scratchpads', content_rowid='course_id')"))
        connection.execute(text("CREATE VIRTUAL TABLE inbox_clips_fts USING "
                                "fts5(clip_id UNINDEXED, title, body, tokenize='unicode61')"))
        connection.execute(text("CREATE TRIGGER course_scratchpads_ai AFTER INSERT ON course_scratchpads BEGIN "
                                "INSERT INTO course_scratchpads_fts(rowid, body) "
                                "VALUES (new.course_id, new.body); END"))
        connection.execute(text("CREATE TRIGGER course_scratchpads_ad AFTER DELETE ON course_scratchpads BEGIN "
                                "INSERT INTO course_scratchpads_fts(course_scratchpads_fts, rowid, body) "
                                "VALUES ('delete', old.course_id, old.body); END"))
        connection.execute(text("CREATE TRIGGER course_scratchpads_au AFTER UPDATE ON course_scratchpads BEGIN "
                                "INSERT INTO course_scratchpads_fts(course_scratchpads_fts, rowid, body) "
                                "VALUES ('delete', old.course_id, old.body); "
                                "INSERT INTO course_scratchpads_fts(rowid, body) "
                                "VALUES (new.course_id, new.body); END"))


@pytest.fixture(scope="session")
def _schema_template(tmp_path_factory):
    # Build only an empty synthetic schema, once per pytest worker. Close every
    # connection before copying it: each test still owns a separate real SQLite
    # file with the original durability, foreign keys, indexes and FTS triggers.
    path = tmp_path_factory.mktemp("empty-schema") / "template.sqlite3"
    engine = create_engine(f"sqlite:///{path}")
    try:
        _create_test_schema(engine)
    finally:
        engine.dispose()
    return path


@pytest.fixture
def factory(settings, coordinator, _schema_template):
    url = make_url(settings.database_url)
    database = Path(url.database) if url.get_backend_name() == "sqlite" and url.database not in {None, ":memory:"} else None
    copied = database is not None and not database.exists()
    if copied:
        database.parent.mkdir(parents=True, exist_ok=True)
        with database.open("xb") as target, _schema_template.open("rb") as source:
            shutil.copyfileobj(source, target)
    engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")
    if not copied:
        # Preserve tests that explicitly provide a database or in-memory URL.
        _create_test_schema(engine)
    try:
        yield make_session_factory(engine)
    finally:
        engine.dispose()
