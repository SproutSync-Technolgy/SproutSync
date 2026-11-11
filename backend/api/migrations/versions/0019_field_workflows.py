"""Persistent notification reading state and idempotent chamber issue reports."""

from alembic import op

revision = "0019_field_workflows"
down_revision = "0018_telemetry_rollups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    alter table public.notification_preferences add column last_alert_seen_at timestamptz;
    alter table public.alerts add column report_key uuid;
    alter table public.alerts add column batch_id integer;
    alter table public.alerts add constraint alerts_batch_owner_fkey foreign key(batch_id, owner_id) references public.batches(id, owner_id);
    alter table public.alerts add constraint alerts_report_key_unique unique(owner_id, report_key);
    create index telemetry_device_recent_raw on public.telemetry_readings(device_id, received_at desc, id desc) where aggregation='raw';
    NOTIFY pgrst, 'reload schema';
    """)


def downgrade() -> None:
    op.execute("""
    drop index public.telemetry_device_recent_raw;
    alter table public.alerts drop constraint alerts_report_key_unique;
    alter table public.alerts drop column report_key;
    alter table public.alerts drop constraint alerts_batch_owner_fkey;
    alter table public.alerts drop column batch_id;
    alter table public.notification_preferences drop column last_alert_seen_at;
    NOTIFY pgrst, 'reload schema';
    """)
