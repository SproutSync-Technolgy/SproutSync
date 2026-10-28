"""Alembic migration environment for the SproutSync API."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401
from app.config import settings
from app.db import Base
from app.migration_support import widen_existing_version_table

config = context.config
# Alembic's ConfigParser treats URL-encoded percent signs as interpolation.
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without opening a database connection."""
    context.configure(url=settings.database_url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations using a live database connection."""
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            # Inspection commands such as `current` have no destination and
            # must stay read-only. Only revision changes may widen the stamp.
            try:
                destination = context.get_revision_argument()
            except KeyError:
                destination = None
            if connection.dialect.name == "postgresql" and destination is not None:
                widen_existing_version_table(connection)
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
