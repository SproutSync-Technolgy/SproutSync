"""Check Google onboarding against real Supabase functions, then roll back."""

import json
from uuid import uuid4

from app.config import settings
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

engine = create_engine(settings.database_url, connect_args={"connect_timeout": 10})
with engine.connect() as connection:
    transaction = connection.begin()
    try:
        subject = str(uuid4())
        connection.execute(
            text("""INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
          VALUES(:id,:email,now(),cast(:app as jsonb),cast(:meta as jsonb))"""),
            {
                "id": subject,
                "email": subject + "@example.invalid",
                "app": json.dumps({"provider": "google", "providers": ["google"]}),
                "meta": json.dumps(
                    {
                        "full_name": "Pat Green",
                        "given_name": "Pat",
                        "family_name": "Green",
                        "avatar_url": "https://example.invalid/avatar.png",
                    }
                ),
            },
        )

        def claims(method):
            connection.execute(
                text("select set_config('request.jwt.claims',:jwt,true)"),
                {
                    "jwt": json.dumps(
                        {
                            "sub": subject,
                            "role": "authenticated",
                            "amr": [{"method": method, "timestamp": 1793000000}],
                        }
                    )
                },
            )

        claims("oauth")
        connection.exec_driver_sql("set local role authenticated")
        profile = (
            connection.execute(text("select * from public.ensure_profile()"))
            .mappings()
            .one()
        )
        assert profile["first_name"] == "Pat" and profile["last_name"] == "Green"
        assert (
            profile["registration_provider"] == "google"
            and profile["onboarding_email_verified_at"] is None
        )
        savepoint = connection.begin_nested()
        try:
            connection.execute(text("select public.save_profile('Pat','Green','','')"))
        except DBAPIError:
            savepoint.rollback()
        else:
            raise AssertionError("Google onboarding was allowed without an email OTP")
        claims("otp")
        profile = (
            connection.execute(text("select * from public.ensure_profile()"))
            .mappings()
            .one()
        )
        assert profile["onboarding_email_verified_at"] is not None
        profile = (
            connection.execute(
                text(
                    "select * from public.save_profile('Pat','Gardener','Sprout Lab','')"
                )
            )
            .mappings()
            .one()
        )
        assert profile["profile_complete"] and profile["display_name"] == "Pat Gardener"
        claims("oauth")
        profile = (
            connection.execute(text("select * from public.ensure_profile()"))
            .mappings()
            .one()
        )
        assert profile["profile_complete"] and profile["last_name"] == "Gardener"
        demo_count = connection.scalar(
            text("select count(*) from public.batches where is_demo")
        )
        assert demo_count == 3
        assert connection.scalar(text('select count(*) from public.devices where is_demo')) == 10
        assert connection.scalar(text('select sum(volume_ml) from public.watering_events where is_demo')) == 30100
        assert connection.scalar(text('select count(*) from public.alerts where is_demo')) == 3
        print(
            "PASS: Google prefilling, OTP enforcement, editable confirmation, returning-account bypass and database sample visibility."
        )
    finally:
        transaction.rollback()
        print("Temporary auth and profile records rolled back.")
