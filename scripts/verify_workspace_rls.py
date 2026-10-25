"""Exercise real Supabase policies using synthetic records, rolled back on exit."""

import json
from uuid import uuid4

from app.config import settings
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
with engine.connect() as connection:
    transaction = connection.begin()
    try:
        actors = []
        for role in ("operator", "operator", "evaluator"):
            subject = str(uuid4())
            email = subject + "@example.invalid"
            actor_id = connection.scalar(
                text(
                    "INSERT INTO public.users(google_subject,email,display_name,role,is_active) VALUES (:sub,:email,'RLS validation',:role,true) RETURNING id"
                ),
                {"sub": subject, "email": email, "role": role},
            )
            actors.append((actor_id, subject, email))
        owner, stranger, reviewer = actors

        def as_user(actor):
            connection.execute(
                text("SELECT set_config('request.jwt.claims', :claims, true)"),
                {"claims": json.dumps({"sub": actor[1], "role": "authenticated"})},
            )
            connection.exec_driver_sql("SET LOCAL ROLE authenticated")

        def denied(sql, params):
            savepoint = connection.begin_nested()
            try:
                connection.execute(text(sql), params)
            except DBAPIError:
                savepoint.rollback()
                return
            savepoint.rollback()
            raise AssertionError("Expected policy denial")

        as_user(owner)
        batch = connection.scalar(
            text(
                "INSERT INTO public.batches(owner_id,code,seed_type,stage,status,started_at) VALUES (:owner,'RLS-CHECK','Mung beans','soaking','active',now()) RETURNING id"
            ),
            {"owner": owner[0]},
        )
        assert (
            connection.scalar(
                text("SELECT count(*) FROM public.activity_logs WHERE owner_id=:owner"),
                {"owner": owner[0]},
            )
            == 1
        )
        as_user(stranger)
        assert (
            connection.scalar(
                text("SELECT count(*) FROM public.batches WHERE id=:id"), {"id": batch}
            )
            == 0
        )
        assert (
            connection.execute(
                text("UPDATE public.batches SET stage='harvested' WHERE id=:id"),
                {"id": batch},
            ).rowcount
            == 0
        )
        as_user(reviewer)
        assert (
            connection.scalar(
                text("SELECT count(*) FROM public.batches WHERE id=:id"), {"id": batch}
            )
            == 0
        )
        denied(
            "INSERT INTO public.batches(owner_id,code,seed_type,stage,status,started_at) VALUES (:owner,'DENIED','Mung beans','soaking','active',now())",
            {"owner": reviewer[0]},
        )
        denied(
            "UPDATE public.users SET role='operator' WHERE id=:id", {"id": reviewer[0]}
        )
        as_user(owner)
        connection.execute(
            text(
                "INSERT INTO public.evaluator_access(owner_id,evaluator_email) VALUES (:owner,:email)"
            ),
            {"owner": owner[0], "email": reviewer[2]},
        )
        as_user(reviewer)
        assert (
            connection.scalar(
                text("SELECT count(*) FROM public.batches WHERE id=:id"), {"id": batch}
            )
            == 1
        )
        connection.execute(
            text(
                "INSERT INTO public.evaluations(evaluator_id,batch_id,rating,comments) VALUES (:actor,:batch,4,'Policy validation')"
            ),
            {"actor": reviewer[0], "batch": batch},
        )
        assert (
            connection.execute(
                text("UPDATE public.batches SET stage='harvested' WHERE id=:id"),
                {"id": batch},
            ).rowcount
            == 0
        )
        print(
            "PASS: operator isolation, evaluator grants, evaluation submission, audit persistence, and role escalation protection."
        )
    finally:
        transaction.rollback()
        print("Synthetic test records rolled back.")
