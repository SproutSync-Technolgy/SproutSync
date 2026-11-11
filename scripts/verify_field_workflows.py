"""Exercise sampling, issue reports and notification RLS on PostgreSQL, then roll back.

Run with the API virtualenv after `alembic upgrade head`. No MQTT publish or
physical commands are sent. All fixtures live inside one rollback-only transaction.
"""

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.config import settings
from app.devices import IssueRequest, report_issue
from app.live_readings import LiveReadings
from app.models import Alert, Batch, Device, TelemetryReading, User
from app.mqtt import ingest_message
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session


def verify():
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            with Session(
                bind=connection,
                join_transaction_mode="create_savepoint",
                expire_on_commit=False,
            ) as db:
                suffix = uuid4().hex
                subject = str(uuid4())
                owner = User(
                    google_subject=subject,
                    email=f"field-{suffix}@example.invalid",
                    display_name="Validation operator",
                    role="operator",
                    is_active=True,
                )
                db.add(owner)
                db.flush()
                device = Device(
                    owner_id=owner.id,
                    name="Validation chamber",
                    serial_number=suffix.upper(),
                    mqtt_topic_prefix=f"validation/{suffix}",
                    is_demo=False,
                )
                batch = Batch(
                    owner_id=owner.id,
                    code=f"VALIDATE-{suffix[:12]}",
                    started_at=datetime.now(UTC),
                )
                db.add_all([device, batch])
                db.commit()
                topic = device.mqtt_topic_prefix + "/telemetry"
                cache = LiveReadings()
                now = datetime.now(UTC)
                # Keep receipt times in the past so the fixture never fabricates
                # a future device heartbeat in the guard trigger.
                start = now - timedelta(seconds=5)
                for index in range(5):
                    assert ingest_message(
                        db,
                        topic,
                        json.dumps({"airTemp": 25 + index / 10, "lux": 0}).encode(),
                        received_at=start + timedelta(seconds=index),
                        live_store=cache,
                    )
                assert (
                    db.scalar(
                        select(func.count())
                        .select_from(TelemetryReading)
                        .where(TelemetryReading.device_id == device.id)
                    )
                    == 1
                )
                assert cache.for_device(device)["temperature_c"] == 25.4
                assert ingest_message(
                    db,
                    topic,
                    b'{"airTemp":0,"lux":0,"status":"SYSTEM OFF"}',
                    received_at=now,
                    live_store=cache,
                )
                assert cache.for_device(device)["temperature_c"] is None
                assert (
                    db.scalar(select(Alert).where(Alert.device_id == device.id)).status
                    == "open"
                )
                request = IssueRequest(
                    request_id=uuid4(),
                    batch_id=batch.id,
                    situation="A leak was observed near the seal.",
                    component="Door seal",
                    risk="equipment",
                    safe_action="Operator notified.",
                )
                report = report_issue(device.id, request, owner, db)
                assert report.batch_id == batch.id
                assert report_issue(device.id, request, owner, db).id == report.id
                assert (
                    db.scalar(
                        select(func.count())
                        .select_from(Alert)
                        .where(Alert.device_id == device.id)
                    )
                    == 2
                )

                def as_owner():
                    connection.execute(
                        text("select set_config('request.jwt.claims', :claims, true)"),
                        {
                            "claims": json.dumps(
                                {"sub": subject, "role": "authenticated"}
                            )
                        },
                    )
                    connection.exec_driver_sql("set local role authenticated")

                as_owner()
                assert (
                    connection.scalar(
                        text("select count(*) from public.alerts where device_id=:id"),
                        {"id": device.id},
                    )
                    == 2
                )
                connection.execute(
                    text(
                        "insert into public.notification_preferences(user_id,last_alert_seen_at) values (:id,now())"
                    ),
                    {"id": owner.id},
                )
                assert (
                    connection.scalar(
                        text(
                            "select last_alert_seen_at is not null from public.notification_preferences where user_id=:id"
                        ),
                        {"id": owner.id},
                    )
                    is True
                )
                assert (
                    connection.execute(
                        text(
                            "update public.notification_preferences set last_alert_seen_at=now() where user_id<>:id"
                        ),
                        {"id": owner.id},
                    ).rowcount
                    == 0
                )
                connection.exec_driver_sql("reset role")
                print(
                    "PostgreSQL sampling, fault alert, idempotent batch-linked issue report, and notification read-state RLS passed."
                )
        finally:
            transaction.rollback()
            print("All validation records rolled back; no hardware commands sent.")
    engine.dispose()


if __name__ == "__main__":
    verify()
