"""Run pending Alembic upgrades inside a rollback-only database transaction."""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.config import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
with engine.connect() as connection:
    transaction = connection.begin()
    try:
        current = connection.scalar(text("select version_num from alembic_version"))
        files = sorted(
            (
                Path(__file__).resolve().parents[1] / "backend/api/migrations/versions"
            ).glob("*.py")
        )
        with Operations.context(MigrationContext.configure(connection)):
            for file in files:
                spec = importlib.util.spec_from_file_location(file.stem, file)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                if module.down_revision == current:
                    module.upgrade()
                    current = module.revision
                    print("Validated:", current)
        print(
            "Pending migrations passed. Validation records and schema changes rolled back."
        )
    finally:
        transaction.rollback()
