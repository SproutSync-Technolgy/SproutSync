"""Verify evaluator RPCs, adaptive history and live RLS; roll back all fixtures.

--pending installs migrations 0022 through 0024 in the rollback-only transaction.
--pending-history-compat validates only 0024 from the already deployed 0023.
No hardware commands, emails or real-user grants are sent.
"""

import argparse
import importlib.util
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.config import settings
from app.models import Device, DeviceLiveState, TelemetryReading, User
from app.mqtt import ingest_message
from app.telemetry_history import flush_history_windows
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session


def verify(pending=False, pending_history_compat=False):
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            if pending or pending_history_compat:
                current = connection.scalar(
                    text("select version_num from public.alembic_version")
                )
                root = (
                    Path(__file__).resolve().parents[1]
                    / "backend/api/migrations/versions"
                )
                names = (
                    ("0024_telemetry_history_compat",)
                    if pending_history_compat
                    else (
                        "0022_evaluator_workflows",
                        "0023_adaptive_telemetry",
                        "0024_telemetry_history_compat",
                    )
                )
                for name in names:
                    spec = importlib.util.spec_from_file_location(
                        name, root / (name + ".py")
                    )
                    migration = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(migration)
                    assert migration.down_revision == current
                    with Operations.context(MigrationContext.configure(connection)):
                        migration.upgrade()
                    current = migration.revision

            def as_user(actor):
                connection.exec_driver_sql("RESET ROLE")
                connection.execute(
                    text("select set_config('request.jwt.claims',:claims,true)"),
                    {
                        "claims": json.dumps(
                            {"sub": actor.google_subject, "role": "authenticated"}
                        )
                    },
                )
                connection.exec_driver_sql("SET LOCAL ROLE authenticated")

            def denied(sql, params=None):
                savepoint = connection.begin_nested()
                try:
                    connection.execute(text(sql), params or {})
                except DBAPIError:
                    savepoint.rollback()
                    return
                savepoint.rollback()
                raise AssertionError("Expected permission denial")

            with Session(
                bind=connection,
                join_transaction_mode="create_savepoint",
                expire_on_commit=False,
            ) as db:
                key = uuid4().hex
                actors = [
                    User(
                        google_subject=str(uuid4()),
                        email=f"adaptive-{key}-{n}@example.invalid",
                        display_name="Adaptive verification",
                        role=role,
                        is_active=True,
                    )
                    for n, role in enumerate(
                        ("operator", "operator", "evaluator", "evaluator", "pending")
                    )
                ]
                db.add_all(actors)
                db.commit()
                owner, stranger, reviewer, second, pending_user = actors
                for target in (reviewer, second):
                    as_user(owner)
                    result = connection.scalar(
                        text("select public.grant_evaluator_access(:email)"),
                        {"email": target.email},
                    )
                    assert result["already_granted"] is False
                    retry = connection.scalar(
                        text("select public.grant_evaluator_access(:email)"),
                        {"email": " " + target.email.upper() + " "},
                    )
                    assert retry["already_granted"] is True
                    assert result["access"]["id"] == retry["access"]["id"]
                assert (
                    connection.scalar(
                        text("select count(*) from public.operator_list_evaluators()")
                    )
                    == 2
                )
                as_user(stranger)
                assert (
                    connection.scalar(
                        text("select count(*) from public.operator_list_evaluators()")
                    )
                    == 0
                )
                connection.execute(
                    text("select public.grant_evaluator_access(:email)"),
                    {"email": reviewer.email},
                )
                as_user(reviewer)
                denied(
                    "select public.grant_evaluator_access(:email)",
                    {"email": second.email},
                )
                as_user(pending_user)
                req = connection.scalar(
                    text("select (public.request_operator_access(:email)).id"),
                    {"email": owner.email},
                )
                as_user(stranger)
                denied("select public.operator_approve_request(:id)", {"id": req})
                as_user(owner)
                assert (
                    connection.scalar(
                        text(
                            "select count(*) from public.operator_list_access_requests()"
                        )
                    )
                    == 1
                )
                assert (
                    connection.scalar(
                        text("select (public.operator_approve_request(:id)).status"),
                        {"id": req},
                    )
                    == "approved"
                )
                assert (
                    connection.scalar(
                        text("select (public.operator_approve_request(:id)).status"),
                        {"id": req},
                    )
                    == "approved"
                )
                connection.exec_driver_sql("RESET ROLE")
                start = datetime.now(UTC).replace(second=0, microsecond=0)
                start = start.replace(minute=(start.minute // 5) * 5) - timedelta(
                    minutes=5
                )
                device = Device(
                    owner_id=owner.id,
                    name="Adaptive verification",
                    serial_number=key,
                    mqtt_topic_prefix="validation/" + key,
                    is_demo=False,
                )
                db.add(device)
                db.commit()
                for number, (second_offset, value) in enumerate(
                    [(0, 20), (2, 22), (60, 24), (62, 26), (120, 28), (298, 30)]
                ):
                    assert ingest_message(
                        db,
                        device.mqtt_topic_prefix + "/telemetry",
                        json.dumps(
                            {
                                "airTemp": value,
                                "lux": 0,
                                "sdOK": True,
                                "messageId": key + str(number),
                            }
                        ).encode(),
                        received_at=start + timedelta(seconds=second_offset),
                    )
                flush_history_windows(db, start + timedelta(seconds=300))
                db.commit()
                assert (
                    db.scalar(
                        select(func.count())
                        .select_from(DeviceLiveState)
                        .where(DeviceLiveState.device_id == device.id)
                    )
                    == 1
                )
                history = db.scalar(
                    select(TelemetryReading).where(
                        TelemetryReading.device_id == device.id,
                        TelemetryReading.aggregation == "five_min",
                    )
                )
                assert history.temperature_c == 25 and history.sample_count == 6
                assert history.light_lux == 0 and history.water_level_percent is None
                assert history.metric_counts["water_level_percent"] == 0
                assert history.metric_stats["temperature_c"]["max"] == 30
                legacy = TelemetryReading(
                    owner_id=owner.id,
                    device_id=device.id,
                    aggregation="five_minute",
                    temperature_c=99,
                    sample_count=150,
                    recorded_at=start - timedelta(minutes=5),
                )
                db.add(legacy)
                db.commit()
                as_user(owner)
                snap = connection.scalar(
                    text("select public.workspace_live_snapshot(null)")
                )
                assert any(
                    row["id"] == legacy.id and row["aggregation"] == "five_minute"
                    for row in snap["readings"]
                )
                assert any(
                    row["device_id"] == device.id and row["temperature_c"] == 30
                    for row in snap["latest_readings"]
                )
                assert "history_state" not in json.dumps(snap)
                denied("select history_state from public.device_live_state")
                denied("update public.device_live_state set latest='{}' where false")
                as_user(stranger)
                assert not any(
                    row["id"] == device.id
                    for row in connection.scalar(
                        text("select public.workspace_live_snapshot(null)")
                    )["devices"]
                )
                as_user(reviewer)
                assert any(
                    row["id"] == device.id
                    for row in connection.scalar(
                        text("select public.workspace_live_snapshot(null)")
                    )["devices"]
                )
                as_user(owner)
                connection.execute(
                    text(
                        "delete from public.evaluator_access where owner_id=:owner and evaluator_id=:evaluator"
                    ),
                    {"owner": owner.id, "evaluator": reviewer.id},
                )
                as_user(reviewer)
                assert not any(
                    row["id"] == device.id
                    for row in connection.scalar(
                        text("select public.workspace_live_snapshot(null)")
                    )["devices"]
                )
                connection.exec_driver_sql("RESET ROLE")
                for function in (
                    "grant_evaluator_access(text)",
                    "operator_list_access_requests()",
                    "workspace_live_snapshot(bigint)",
                ):
                    assert not connection.scalar(
                        text("select has_function_privilege('anon',:fn,'execute')"),
                        {"fn": "public." + function},
                    )
                print(
                    "PASS: idempotent grants, multiple evaluators, isolated approval, live snapshot RLS/revocation, private state, legacy history compatibility and six-sample five-minute average."
                )
        finally:
            transaction.rollback()
            print(
                "All synthetic fixtures and pending schema changes rolled back; no hardware commands sent."
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--pending", action="store_true")
    mode.add_argument("--pending-history-compat", action="store_true")
    args = parser.parse_args()
    verify(args.pending, args.pending_history_compat)
