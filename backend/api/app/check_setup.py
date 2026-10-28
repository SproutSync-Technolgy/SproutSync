"""Read-only startup checks. Never print connection strings or credentials."""

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError, SQLAlchemyError

from app.config import Settings, settings


def validate_settings(config: Settings) -> list[str]:
    errors = []
    try:
        url = make_url(config.database_url)
        if url.drivername != "postgresql+psycopg" or not url.host or not url.database:
            errors.append(
                "DATABASE_URL must be a postgresql+psycopg URL for your Supabase database."
            )
    except (ArgumentError, TypeError, ValueError):
        errors.append("DATABASE_URL is not a valid SQLAlchemy connection URL.")
    if not config.supabase_url or not config.supabase_anon_key:
        errors.append(
            "Set SUPABASE_URL and SUPABASE_ANON_KEY in the root .env or container environment."
        )
    return errors


def check_database(database_url: str) -> bool:
    """Require the real Supabase Auth schema before any migrations run."""
    engine = create_engine(database_url, connect_args={"connect_timeout": 10})
    try:
        with engine.connect() as connection:
            return bool(
                connection.scalar(
                    text("""
                SELECT to_regclass('auth.users') IS NOT NULL
                  AND to_regprocedure('auth.uid()') IS NOT NULL
                  AND to_regprocedure('auth.jwt()') IS NOT NULL
                  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
                  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
            """)
                )
            )
    finally:
        engine.dispose()


def main() -> int:
    errors = validate_settings(settings)
    if errors:
        for error in errors:
            print(f"Setup error: {error}")
        return 1
    try:
        compatible = check_database(settings.database_url)
    except SQLAlchemyError:
        print(
            "Setup error: cannot connect to DATABASE_URL. Check the DB password, URL encoding, SSL, network, and host. Inside Docker, 127.0.0.1 is the API container itself."
        )
        return 1
    if not compatible:
        print(
            "Setup error: this database lacks Supabase Auth schemas/functions/roles. Use the matching hosted or full local Supabase database; plain PostgreSQL alone is insufficient. See SETUP.md."
        )
        return 1
    print("Database connection and Supabase prerequisites passed (read-only check).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
