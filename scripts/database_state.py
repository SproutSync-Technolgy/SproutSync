"""Inspect schema without printing credentials or personal records."""

from app.config import settings
from sqlalchemy import create_engine, inspect, text

engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
print("Database driver:", engine.url.drivername)
print("Supabase host:", bool(engine.url.host and "supabase" in engine.url.host))
with engine.connect() as connection:
    inspector = inspect(connection)
    tables = inspector.get_table_names(schema="public")
    print("Public tables:", ", ".join(tables))
    for table in ("users", "batches"):
        if table in tables:
            print(
                table,
                "columns:",
                ", ".join(c["name"] for c in inspector.get_columns(table)),
            )
    print(
        "Supabase auth available:",
        connection.scalar(text("select to_regclass('auth.users') is not null")),
    )
