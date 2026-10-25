"""Validate the workspace migration in a transaction, then roll it back."""

from pathlib import Path

from app.config import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
with engine.connect() as connection:
    transaction = connection.begin()
    try:
        policies = connection.execute(
            text(
                "select tablename, policyname from pg_policies where schemaname='public' and tablename in ('users','batches','sessions')"
            )
        ).all()
        if policies:
            raise RuntimeError(
                f"Review existing access policies before migration: {policies}"
            )
        script = (
            Path(__file__).resolve().parents[1]
            / "backend/api/migrations/versions/0004_workspace.sql"
        )
        with connection.connection.driver_connection.cursor() as cursor:
            cursor.execute(script.read_text(encoding="utf-8"))
        for table in (
            "users",
            "batches",
            "devices",
            "alerts",
            "evaluations",
            "evidence_records",
            "notification_preferences",
        ):
            assert connection.scalar(
                text(
                    "select relrowsecurity from pg_class where oid=to_regclass(:table)"
                ),
                {"table": "public." + table},
            )
            assert not connection.scalar(
                text("select has_table_privilege('anon', :table, 'SELECT')"),
                {"table": "public." + table},
            )
        assert not connection.scalar(
            text("select has_table_privilege('authenticated','public.users','UPDATE')")
        )
        assert not connection.scalar(
            text(
                "select has_table_privilege('authenticated','public.telemetry_readings','INSERT')"
            )
        )
        print(
            "Migration SQL and access-grant checks passed. All validation changes rolled back."
        )
    finally:
        transaction.rollback()
