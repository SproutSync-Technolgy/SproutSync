"""Check live public-table protection and request workflows; roll back fixtures.

Use --pending to test migration 0021 without persisting any schema change.
No user records, tokens or credentials are printed.
"""

import argparse
import importlib.util
import json
from pathlib import Path
from uuid import uuid4

import httpx
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.config import settings
from app.main import approve_access_request
from app.models import User
from dotenv import dotenv_values
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session


def verify(pending=False):
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            if pending:
                path = (
                    Path(__file__).resolve().parents[1]
                    / "backend/api/migrations/versions/0021_internal_table_security.py"
                )
                spec = importlib.util.spec_from_file_location(
                    "security_migration", path
                )
                migration = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(migration)
                assert (
                    connection.scalar(
                        text("select version_num from public.alembic_version")
                    )
                    == migration.down_revision
                )
                with Operations.context(MigrationContext.configure(connection)):
                    migration.upgrade()

            unprotected = connection.scalars(
                text("""
                select c.relname from pg_class c
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relkind in ('r','p')
                and not c.relrowsecurity order by c.relname
            """)
            ).all()
            assert not unprotected, f"Public tables without RLS: {unprotected}"
            for role in ("anon", "authenticated"):
                assert not connection.scalar(
                    text("""
                    select has_table_privilege(:role,'public.alembic_version',
                        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                    or has_any_column_privilege(:role,'public.alembic_version',
                        'SELECT,INSERT,UPDATE,REFERENCES')
                """),
                    {"role": role},
                )
                assert not connection.scalar(
                    text("""
                    select has_table_privilege(:role,'public.access_requests',
                        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                    or has_any_column_privilege(:role,'public.access_requests',
                        'INSERT,UPDATE,REFERENCES')
                    or has_sequence_privilege(:role,'public.access_requests_id_seq',
                        'USAGE,SELECT,UPDATE')
                """),
                    {"role": role},
                )
                assert not connection.scalar(
                    text("""
                    select exists(select 1 from pg_class c
                    join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relkind in ('r','p')
                    and has_table_privilege(:role,c.oid,'TRUNCATE'))
                """),
                    {"role": role},
                )
            assert not connection.scalar(
                text(
                    "select has_table_privilege('anon','public.access_requests','SELECT')"
                )
            )
            assert connection.scalar(
                text(
                    "select has_table_privilege('authenticated','public.access_requests','SELECT')"
                )
            )
            # Trusted migrations must retain read and write access to their stamp.
            stamp = connection.scalar(
                text("select version_num from public.alembic_version")
            )
            assert (
                connection.execute(
                    text("update public.alembic_version set version_num=version_num")
                ).rowcount
                == 1
            )

            actors = []
            for role in ("operator", "operator", "pending"):
                subject = str(uuid4())
                email = subject + "@example.invalid"
                actor_id = connection.scalar(
                    text("""
                    insert into public.users(google_subject,email,display_name,role,is_active)
                    values (:subject,:email,'Security verification',:role,true) returning id
                """),
                    {"subject": subject, "email": email, "role": role},
                )
                actors.append((actor_id, subject, email))
            owner, stranger, requester = actors

            def as_user(actor=None):
                connection.exec_driver_sql("RESET ROLE")
                claims = (
                    {"role": "anon"}
                    if actor is None
                    else {"sub": actor[1], "role": "authenticated"}
                )
                connection.execute(
                    text("select set_config('request.jwt.claims',:claims,true)"),
                    {"claims": json.dumps(claims)},
                )
                connection.exec_driver_sql(
                    "SET LOCAL ROLE anon"
                    if actor is None
                    else "SET LOCAL ROLE authenticated"
                )

            def denied(sql, params=None, privilege_only=False):
                savepoint = connection.begin_nested()
                try:
                    connection.execute(text(sql), params or {})
                except DBAPIError as error:
                    savepoint.rollback()
                    if privilege_only:
                        assert getattr(error.orig, "sqlstate", None) == "42501"
                    return
                savepoint.rollback()
                raise AssertionError("Expected authorization denial")

            for actor in (None, owner, requester):
                as_user(actor)
                denied(
                    "select version_num from public.alembic_version",
                    privilege_only=True,
                )
                denied(
                    "update public.alembic_version set version_num=version_num where false",
                    privilege_only=True,
                )
                denied(
                    "delete from public.access_requests where false",
                    privilege_only=True,
                )

            as_user()
            denied("select id from public.access_requests", privilege_only=True)
            denied("select public.request_operator_access(:email)", {"email": owner[2]})
            as_user(requester)
            request_id = connection.scalar(
                text("select (public.request_operator_access(:email)).id"),
                {"email": owner[2]},
            )
            assert (
                connection.scalar(
                    text("select count(*) from public.access_requests where id=:id"),
                    {"id": request_id},
                )
                == 1
            )
            denied(
                "update public.access_requests set status='approved' where id=:id",
                {"id": request_id},
                privilege_only=True,
            )
            as_user(stranger)
            assert (
                connection.scalar(
                    text("select count(*) from public.access_requests where id=:id"),
                    {"id": request_id},
                )
                == 0
            )
            denied("select public.operator_approve_request(:id)", {"id": request_id})
            # Current clients approve through FastAPI, which uses the trusted
            # backend connection. Exercise that actual path with the same
            # rollback-only transaction, including the foreign-owner denial.
            connection.exec_driver_sql("RESET ROLE")
            with Session(
                bind=connection, join_transaction_mode="create_savepoint"
            ) as db:
                try:
                    approve_access_request(request_id, db.get(User, stranger[0]), db)
                except HTTPException as error:
                    assert error.status_code == 403
                else:
                    raise AssertionError("A foreign operator approved the request")
                result = approve_access_request(request_id, db.get(User, owner[0]), db)
                assert result["status"] == "approved"
            as_user(requester)
            assert (
                connection.scalar(
                    text("select status from public.access_requests where id=:id"),
                    {"id": request_id},
                )
                == "approved"
            )
            assert (
                connection.scalar(
                    text(
                        "select owner_id from public.evaluator_access where evaluator_id=:id"
                    ),
                    {"id": requester[0]},
                )
                == owner[0]
            )
            connection.exec_driver_sql("RESET ROLE")
            assert (
                connection.scalar(
                    text("select version_num from public.alembic_version")
                )
                == stamp
            )
            print(
                "PASS: all public tables have RLS; metadata and request-write privileges denied;"
            )
            print(
                "trusted migrations, owner isolation, request submission and approval still work."
            )
        finally:
            transaction.rollback()
            print("All verification fixtures and pending schema changes rolled back.")


def verify_http():
    """Verify the actual anonymous Data API without logging its public key."""
    environment = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    public_key = settings.supabase_anon_key or environment.get("VITE_SUPABASE_ANON_KEY")
    assert settings.supabase_url and public_key, (
        "Public Supabase client configuration required"
    )
    with httpx.Client(timeout=15) as client:
        for table, column in (
            ("alembic_version", "version_num"),
            ("access_requests", "id"),
        ):
            response = client.get(
                settings.supabase_url.rstrip("/") + "/rest/v1/" + table,
                params={"select": column, "limit": 1},
                headers={"apikey": public_key},
            )
            assert response.status_code in (401, 403), (
                f"Anonymous {table} request returned {response.status_code}"
            )
            assert response.json().get("code") == "42501"
    print("PASS: anonymous HTTP Data API requests to both protected tables are denied.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pending", action="store_true")
    parser.add_argument(
        "--http", action="store_true", help="Also verify installed Data API permissions"
    )
    args = parser.parse_args()
    assert not (args.pending and args.http), (
        "HTTP checks require the installed migration"
    )
    verify(args.pending)
    if args.http:
        verify_http()
