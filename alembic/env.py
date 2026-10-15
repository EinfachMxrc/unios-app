# SPDX-License-Identifier: AGPL-3.0-or-later

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.config import get_settings
from app.db.models import Base
from app.host.lease import HostCoordinator

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
settings = config.attributes.get("settings") or get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    # FTS5 und seine Shadow-Tabellen werden bewusst per SQL migriert.
    return not (type_ == "table" and name.startswith(("resource_texts_fts", "notes_fts", "jots_fts",
                                                        "material_annotations_fts", "course_scratchpads_fts",
                                                        "inbox_clips_fts")))


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata,
                      literal_binds=True, include_name=include_name)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=True, include_name=include_name)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    coordinator = config.attributes.get("host_coordinator")
    owns_coordinator = coordinator is None
    coordinator = coordinator or HostCoordinator(settings)
    if not coordinator.start():
        raise RuntimeError("Datenbankmigration braucht den Staffelstab und eine freie Host-Instanz")
    try:
        run_migrations_online()
    finally:
        if owns_coordinator:
            coordinator.close()
