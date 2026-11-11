"""Verify global search under actual PostgreSQL RLS; roll back every fixture.

--pending also installs migration 0020 inside this rollback-only transaction.
"""

import argparse
import importlib.util
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.config import settings
from app.models import ActivityLog, Alert, Batch, Device, EvaluatorAccess, User
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


def verify(pending=False):
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            if pending:
                path = (
                    Path(__file__).resolve().parents[1]
                    / "backend/api/migrations/versions/0020_workspace_search.py"
                )
                spec = importlib.util.spec_from_file_location("search_migration", path)
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
            assert (
                connection.scalar(
                    text(
                        "select prosecdef from pg_proc where oid='public.search_workspace(text)'::regprocedure"
                    )
                )
                is False
            )
            assert (
                connection.scalar(
                    text(
                        "select has_function_privilege('anon', 'public.search_workspace(text)', 'execute')"
                    )
                )
                is False
            )
            assert (
                connection.scalar(
                    text(
                        "select has_function_privilege('authenticated', 'public.search_workspace(text)', 'execute')"
                    )
                )
                is True
            )
            with Session(
                bind=connection,
                join_transaction_mode="create_savepoint",
                expire_on_commit=False,
            ) as db:
                key = "SEARCH-" + uuid4().hex[:16]
                users = [
                    User(
                        google_subject=str(uuid4()),
                        email=f"{key.lower()}-{index}@example.invalid",
                        display_name=key,
                        role=role,
                        is_active=True,
                    )
                    for index, role in enumerate(
                        ["operator", "operator", "evaluator", "pending", "superadmin"]
                    )
                ]
                db.add_all(users)
                db.flush()
                owner, stranger, evaluator, pending_user, admin = users
                device = Device(
                    owner_id=owner.id, name=key, serial_number=key, is_demo=False
                )
                other_device = Device(
                    owner_id=stranger.id,
                    name=key + "-PRIVATE",
                    serial_number=key + "-PRIVATE",
                    is_demo=False,
                )
                batch = Batch(
                    owner_id=owner.id,
                    code=key,
                    notes="Literal 100%_complete",
                    started_at=datetime.now(UTC),
                )
                private_batch = Batch(
                    owner_id=stranger.id,
                    code=key + "-PRIVATE",
                    started_at=datetime.now(UTC),
                )
                db.add_all([device, other_device, batch, private_batch])
                db.flush()
                db.add(
                    Alert(
                        owner_id=owner.id,
                        device_id=device.id,
                        title=key,
                        message="Validation issue",
                        severity="warning",
                        status="open",
                        category="device",
                    )
                )
                db.add(
                    ActivityLog(
                        owner_id=owner.id, actor_id=owner.id, action=key, resource=key
                    )
                )
                db.commit()
                for table, columns, values in [
                    (
                        "evidence_records",
                        "owner_id,batch_id,title,category,result,notes",
                        {
                            "owner_id": owner.id,
                            "batch_id": batch.id,
                            "title": key,
                            "category": "safety",
                            "result": "pending",
                            "notes": key,
                        },
                    ),
                    (
                        "maintenance_records",
                        "owner_id,device_id,notes",
                        {"owner_id": owner.id, "device_id": device.id, "notes": key},
                    ),
                    (
                        "irrigation_schedules",
                        "owner_id,device_id,next_run_at,duration_seconds",
                        {
                            "owner_id": owner.id,
                            "device_id": device.id,
                            "next_run_at": datetime.now(UTC),
                            "duration_seconds": 15,
                        },
                    ),
                    (
                        "watering_events",
                        "owner_id,device_id,volume_ml,duration_seconds",
                        {
                            "owner_id": owner.id,
                            "device_id": device.id,
                            "volume_ml": 10,
                            "duration_seconds": 1,
                        },
                    ),
                    (
                        "evaluations",
                        "evaluator_id,batch_id,rating,comments",
                        {
                            "evaluator_id": evaluator.id,
                            "batch_id": batch.id,
                            "rating": 4,
                            "comments": key,
                        },
                    ),
                ]:
                    connection.execute(
                        text(
                            f"insert into public.{table} ({columns}) values ({','.join(':' + column for column in columns.split(','))})"
                        ),
                        values,
                    )

                def search(actor, query=key):
                    connection.execute(
                        text("select set_config('request.jwt.claims', :claims, true)"),
                        {
                            "claims": json.dumps(
                                {"sub": actor.google_subject, "role": "authenticated"}
                            )
                        },
                    )
                    connection.exec_driver_sql("set local role authenticated")
                    try:
                        return (
                            connection.execute(
                                text("select * from public.search_workspace(:query)"),
                                {"query": query},
                            )
                            .mappings()
                            .all()
                        )
                    finally:
                        connection.exec_driver_sql("reset role")

                owned = search(owner)
                assert {row["kind"] for row in owned} == {
                    "batch",
                    "device",
                    "alert",
                    "maintenance",
                    "evidence",
                    "evaluation",
                    "schedule",
                    "watering",
                }
                assert not any("PRIVATE" in row["title"] for row in owned)
                assert any("PRIVATE" in row["title"] for row in search(stranger))
                assert search(evaluator) == [] and search(pending_user) == []
                assert any(row["kind"] == "activity" for row in search(admin))
                assert any("PRIVATE" in row["title"] for row in search(admin))
                db.add(
                    EvaluatorAccess(
                        owner_id=owner.id,
                        evaluator_id=evaluator.id,
                        evaluator_email=evaluator.email,
                    )
                )
                db.commit()
                shared = search(evaluator)
                assert shared and not any(
                    "PRIVATE" in row["title"] or row["kind"] == "activity"
                    for row in shared
                )
                for row in shared:
                    assert row["payload"].get("owner_id", owner.id) == owner.id
                assert search(owner, "%_")[0]["record_id"] == batch.id
                assert search(owner, "' OR true --") == []
                assert search(owner, " ") == [] and search(owner, "a") == []
                for index in range(7):
                    db.add(
                        Batch(
                            owner_id=owner.id,
                            code=f"{key}-{index}",
                            started_at=datetime.now(UTC),
                        )
                    )
                db.commit()
                assert (
                    len([row for row in search(owner) if row["kind"] == "batch"]) == 5
                )
                owner.is_active = False
                db.commit()
                assert search(owner) == []
                connection.execute(
                    text("delete from public.evaluator_access where owner_id=:id"),
                    {"id": owner.id},
                )
                assert search(evaluator) == []
                print(
                    "Search contract, result bounds, literal matching, active-role checks, owner/evaluator isolation, grant revocation, and admin scope passed on PostgreSQL."
                )
        finally:
            transaction.rollback()
            print(
                "Search fixtures and any pending migration rolled back. No hardware commands sent."
            )
    engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pending", action="store_true")
    verify(parser.parse_args().pending)
