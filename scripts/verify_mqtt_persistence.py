"""Verify real PostgreSQL telemetry persistence/RLS; roll back all synthetic records."""

import json
from uuid import uuid4

from app.config import settings
from app.mqtt import ingest_message
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
with engine.connect() as connection:
    transaction = connection.begin()
    try:
        assert (
            connection.scalar(text("select version_num from alembic_version"))
            == "0013_mqtt_telemetry"
        )
        actors = []
        for role in ("operator", "operator", "evaluator"):
            subject = str(uuid4())
            email = subject + "@example.invalid"
            actor_id = connection.scalar(
                text("""
                insert into public.users(google_subject,email,display_name,role,is_active)
                values (:subject,:email,'MQTT validation',:role,true) returning id
            """),
                {"subject": subject, "email": email, "role": role},
            )
            actors.append((actor_id, subject, email))
        owner, stranger, evaluator = actors
        prefix = "validation/" + str(uuid4())
        device_id = connection.scalar(
            text("""
            insert into public.devices(owner_id,name,serial_number,mqtt_topic_prefix,status)
            values (:owner,'MQTT validation',:serial,:prefix,'online') returning id
        """),
            {"owner": owner[0], "serial": str(uuid4()), "prefix": prefix},
        )
        assert (
            connection.scalar(
                text("select status from public.devices where id=:id"),
                {"id": device_id},
            )
            == "pending"
        )
        with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
            packet = b'{"airTemp":26.2,"airHum":87,"waterTemp":20.4,"lux":0,"voltage":5.02,"sdOK":true,"messageId":"validation-1"}'
            assert ingest_message(db, prefix + "/telemetry", packet)
            assert not ingest_message(db, prefix + "/telemetry", packet)
        assert (
            connection.scalar(
                text("select status from public.devices where id=:id"),
                {"id": device_id},
            )
            == "online"
        )
        assert (
            connection.scalar(
                text(
                    "select count(*) from public.telemetry_readings where device_id=:id"
                ),
                {"id": device_id},
            )
            == 1
        )
        assert (
            connection.scalar(
                text(
                    "select water_level_percent from public.telemetry_readings where device_id=:id"
                ),
                {"id": device_id},
            )
            is None
        )

        def as_user(actor):
            connection.execute(
                text("select set_config('request.jwt.claims', :claims, true)"),
                {"claims": json.dumps({"sub": actor[1], "role": "authenticated"})},
            )
            connection.exec_driver_sql("set local role authenticated")

        for actor, expected in ((owner, 1), (stranger, 0), (evaluator, 0)):
            as_user(actor)
            assert (
                connection.scalar(
                    text(
                        "select count(*) from public.telemetry_readings where device_id=:id"
                    ),
                    {"id": device_id},
                )
                == expected
            )
            connection.exec_driver_sql("reset role")

        connection.execute(
            text(
                "insert into public.evaluator_access(owner_id,evaluator_id,evaluator_email) values (:owner,:evaluator,:email)"
            ),
            {"owner": owner[0], "evaluator": evaluator[0], "email": evaluator[2]},
        )
        as_user(evaluator)
        assert (
            connection.scalar(
                text(
                    "select count(*) from public.telemetry_readings where device_id=:id"
                ),
                {"id": device_id},
            )
            == 1
        )
        connection.exec_driver_sql("reset role")
        as_user(owner)
        for statement in (
            "update public.devices set mqtt_topic_prefix='forged' where id=:id",
            "insert into public.telemetry_readings(owner_id,device_id,temperature_c) values (:owner,:id,99)",
        ):
            savepoint = connection.begin_nested()
            try:
                connection.execute(
                    text(statement), {"id": device_id, "owner": owner[0]}
                )
            except DBAPIError:
                savepoint.rollback()
            else:
                savepoint.rollback()
                raise AssertionError(
                    "Browser role must not set connection state or telemetry"
                )
        connection.exec_driver_sql("reset role")
        publication = (
            connection.execute(
                text(
                    "select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('devices','telemetry_readings')"
                )
            )
            .scalars()
            .all()
        )
        assert set(publication) == {"devices", "telemetry_readings"}
        print(
            "PostgreSQL persistence, duplicate rejection, grant detection guard, owner/evaluator RLS, browser write restrictions, and Realtime publication passed."
        )
    finally:
        transaction.rollback()
        print("Synthetic validation records rolled back.")
