# SPDX-License-Identifier: AGPL-3.0-or-later

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.host.lease import HostCoordinator

SQLITE_TIMEOUT_SECONDS = 30


def make_engine(settings: Settings | None = None, coordinator: HostCoordinator | None = None):
    settings = settings or get_settings()
    if settings.database_url.startswith("sqlite") and coordinator is not None:
        database = make_url(settings.database_url).database
        if not database or database == ":memory:":
            raise ValueError("Staffelstab benötigt eine SQLite-Datei")
        database_path = Path(database).resolve()

        def connection():
            if coordinator.is_writer:
                database_path.parent.mkdir(parents=True, exist_ok=True)
                return sqlite3.connect(database_path, check_same_thread=False, timeout=SQLITE_TIMEOUT_SECONDS,
                                       cached_statements=0)
            return sqlite3.connect(f"{database_path.as_uri()}?mode=ro", uri=True,
                                   check_same_thread=False, timeout=SQLITE_TIMEOUT_SECONDS, cached_statements=0)

        engine = create_engine(settings.database_url, creator=connection)
    else:
        engine = create_engine(settings.database_url, connect_args={"check_same_thread": False,
                               "timeout": SQLITE_TIMEOUT_SECONDS} if settings.database_url.startswith("sqlite") else {})
    if settings.database_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")
            if coordinator is None or coordinator.is_writer:
                connection.execute("PRAGMA journal_mode=WAL")
            if coordinator is not None:
                def authorize(operation, first, _second, _database, _source):
                    # SQLite parses CTEs, comments and nested statements for us.
                    # Reprepare every statement so losing the lease also fences
                    # previously prepared writes on an existing connection.
                    if operation in {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ,
                                     sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}:
                        return sqlite3.SQLITE_OK
                    if operation == sqlite3.SQLITE_TRANSACTION and first in {"BEGIN", "ROLLBACK"}:
                        return sqlite3.SQLITE_OK
                    return sqlite3.SQLITE_OK if coordinator.is_writer else sqlite3.SQLITE_DENY

                connection.set_authorizer(authorize)
    if coordinator is not None:
        @event.listens_for(engine, "handle_error")
        def reject_standby_write(context):
            if getattr(context.original_exception, "sqlite_errorcode", None) == sqlite3.SQLITE_AUTH:
                coordinator.assert_writer()
    return engine


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False, class_=Session)


def begin_write_transaction(session: Session) -> None:
    """Reserve SQLite's writer at a fresh transaction boundary before reading.

    Call after committing earlier work, outside network/parser operations and
    before a savepoint. A savepoint's read snapshot cannot safely become a writer
    after another connection commits; increasing busy_timeout cannot fix that.
    The explicit outer BEGIN also keeps released savepoints rollbackable.
    """
    if session.get_bind().dialect.name == 'sqlite':
        session.connection().exec_driver_sql('BEGIN IMMEDIATE')

