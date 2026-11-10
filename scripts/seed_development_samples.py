"""Explicit, idempotent sample records for one existing development operator.

Run without --apply to validate the complete insert in a rolled-back transaction.
Never publishes MQTT messages, changes roles, or binds a real controller.
"""

import argparse
import json
from datetime import UTC, datetime, timedelta

from app.db import engine
from sqlalchemy import text


def seed_samples(db, email: str) -> dict:
    owner = (
        db.execute(
            text(
                "select id, role, is_active from public.users where lower(email)=lower(:email) for update"
            ),
            {"email": email.strip()},
        )
        .mappings()
        .one_or_none()
    )
    if not owner or owner["role"] != "operator" or not owner["is_active"]:
        raise ValueError(
            "Choose an existing active operator. No roles or access grants are changed."
        )
    owner_id = owner["id"]
    db.execute(text("select pg_advisory_xact_lock(:owner)"), {"owner": owner_id})
    counts = {
        name: 0
        for name in (
            "devices",
            "trays",
            "batches",
            "watering_events",
            "irrigation_schedules",
            "evidence_records",
            "activity_logs",
        )
    }
    serial = f"DEMO-SS-{owner_id}-CHAMBER"
    chamber = (
        db.execute(
            text(
                "select id,owner_id,is_demo,mqtt_topic_prefix from public.devices where serial_number=:serial"
            ),
            {"serial": serial},
        )
        .mappings()
        .one_or_none()
    )
    if chamber and (
        chamber["owner_id"] != owner_id
        or not chamber["is_demo"]
        or chamber["mqtt_topic_prefix"]
    ):
        raise ValueError(
            "Sample serial conflicts with a real or differently owned device; nothing was overwritten."
        )
    if chamber:
        chamber_id = chamber["id"]
    else:
        chamber_id = db.scalar(
            text(
                "insert into public.devices(owner_id,name,serial_number,status,last_seen_at,is_demo,requires_serial_number) values(:owner,'DEMO chamber â€” sample records only',:serial,'offline',null,true,true) returning id"
            ),
            {"owner": owner_id, "serial": serial},
        )
        counts["devices"] += 1
    now = datetime.now(UTC)
    batches = []
    descriptions = [
        ("soaking", "active", 0),
        ("rinsing", "active", 1),
        ("growing", "active", 2),
        ("ready", "active", 4),
        ("harvested", "completed", 5),
        ("archived", "archived", 7),
    ]
    for position, (stage, status, days) in enumerate(descriptions, 1):
        tray = db.scalar(
            text(
                "select id from public.trays where owner_id=:owner and device_id=:device and position=:position"
            ),
            {"owner": owner_id, "device": chamber_id, "position": position},
        )
        if not tray:
            tray = db.scalar(
                text(
                    "insert into public.trays(owner_id,device_id,position,status,is_demo) values(:owner,:device,:position,:status,true) returning id"
                ),
                {
                    "owner": owner_id,
                    "device": chamber_id,
                    "position": position,
                    "status": "active" if status == "active" else "idle",
                },
            )
            counts["trays"] += 1
        code = f"DEMO-SS-{position:03d}"
        existing = (
            db.execute(
                text(
                    "select id,is_demo from public.batches where owner_id=:owner and lower(code)=lower(:code)"
                ),
                {"owner": owner_id, "code": code},
            )
            .mappings()
            .one_or_none()
        )
        if existing and not existing["is_demo"]:
            raise ValueError(
                "A sample batch code conflicts with a real batch; nothing was overwritten."
            )
        if existing:
            batch = existing["id"]
        else:
            batch = db.scalar(
                text(
                    "insert into public.batches(owner_id,code,seed_type,seed_weight_grams,stage,status,started_at,target_harvest_at,notes,tray_id,is_demo) values(:owner,:code,'Mung beans',100,:stage,:status,:started,:harvest,:notes,:tray,true) returning id"
                ),
                {
                    "owner": owner_id,
                    "code": code,
                    "stage": stage,
                    "status": status,
                    "started": now - timedelta(days=days),
                    "harvest": now + timedelta(days=4 - days),
                    "notes": "Sample dataset v1. Synthetic production example; not a real crop or sensor measurement.",
                    "tray": tray,
                },
            )
            counts["batches"] += 1
        batches.append(batch)
    if not db.scalar(
        text(
            "select count(*) from public.watering_events where owner_id=:owner and device_id=:device and is_demo"
        ),
        {"owner": owner_id, "device": chamber_id},
    ):
        for day in range(7):
            for cycle in range(2):
                db.execute(
                    text(
                        "insert into public.watering_events(owner_id,batch_id,device_id,volume_ml,duration_seconds,occurred_at,is_demo) values(:owner,:batch,:device,:volume,45,:occurred,true)"
                    ),
                    {
                        "owner": owner_id,
                        "batch": batches[2] if day < 2 else batches[5],
                        "device": chamber_id,
                        "volume": 900 + day * 25 + cycle * 50,
                        "occurred": now - timedelta(days=day, hours=cycle * 6 + 1),
                    },
                )
                counts["watering_events"] += 1
    if not db.scalar(
        text(
            "select count(*) from public.irrigation_schedules where owner_id=:owner and device_id=:device and is_demo"
        ),
        {"owner": owner_id, "device": chamber_id},
    ):
        for hours in (2, 6, 10):
            db.execute(
                text(
                    "insert into public.irrigation_schedules(owner_id,device_id,next_run_at,duration_seconds,enabled,is_demo) values(:owner,:device,:next,45,true,true)"
                ),
                {
                    "owner": owner_id,
                    "device": chamber_id,
                    "next": now + timedelta(hours=hours),
                },
            )
            counts["irrigation_schedules"] += 1
    if not db.scalar(
        text(
            "select count(*) from public.evidence_records where owner_id=:owner and batch_id=:batch and is_demo"
        ),
        {"owner": owner_id, "batch": batches[2]},
    ):
        for category, title in (
            ("calibration", "DEMO: sensor calibration checklist"),
            ("irrigation", "DEMO: rinse schedule inspection"),
            ("safety", "DEMO: low-water interlock review"),
        ):
            db.execute(
                text(
                    "insert into public.evidence_records(owner_id,batch_id,category,title,result,notes,is_demo) values(:owner,:batch,:category,:title,'pending','Sample planned inspection. No physical test has been completed.',true)"
                ),
                {
                    "owner": owner_id,
                    "batch": batches[2],
                    "category": category,
                    "title": title,
                },
            )
            counts["evidence_records"] += 1
    # Batch triggers create their own audit rows. Label only the initial inserts
    # of this reserved sample dataset; leave subsequent human edits untouched.
    labelled = db.execute(
        text(
            "update public.activity_logs l set is_demo=true from public.batches b where l.owner_id=:owner and b.owner_id=:owner and b.is_demo and b.code like 'DEMO-SS-%' and l.resource='batches:'||b.id::text and l.action='insert' and l.actor_id is null and not l.is_demo"
        ),
        {"owner": owner_id},
    )
    labelled_count = max(labelled.rowcount, 0)
    if any(counts.values()) or labelled_count:
        db.execute(
            text(
                "insert into public.activity_logs(owner_id,actor_id,action,resource,is_demo) values(:owner,null,'seed_development_samples','sample-dataset:v1',true)"
            ),
            {"owner": owner_id},
        )
        counts["activity_logs"] += 1
    return {
        "operator_id": owner_id,
        "created": counts,
        "sample_audit_rows_labelled": labelled_count,
        "telemetry_created": 0,
        "mqtt_messages_sent": 0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--operator-email", required=True)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist samples; without this option everything is rolled back.",
    )
    args = parser.parse_args()
    with engine.connect() as db:
        transaction = db.begin()
        try:
            report = seed_samples(db, args.operator_email)
            # A repeat must not create duplicate samples.
            repeated = seed_samples(db, args.operator_email)
            assert not any(repeated["created"].values()), "Idempotency check failed"
            if args.apply:
                transaction.commit()
            else:
                transaction.rollback()
            print(json.dumps({"applied": args.apply, **report}))
        except Exception:
            transaction.rollback()
            raise


if __name__ == "__main__":
    main()
