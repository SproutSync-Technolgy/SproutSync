"""Support persisted five-minute telemetry averages."""

from alembic import op

revision = "0019_five_minute_telemetry"
down_revision = "0018_telemetry_rollups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    drop index public.telemetry_rollup_bucket_unique;
    alter table public.telemetry_readings
      alter column aggregation type varchar(16),
      drop constraint telemetry_aggregation_check,
      add constraint telemetry_aggregation_check
        check (aggregation in ('raw', 'five_minute', 'hourly', 'daily'));
    create unique index telemetry_rollup_bucket_unique
      on public.telemetry_readings (device_id, aggregation, recorded_at)
      where aggregation in ('five_minute', 'hourly', 'daily');
    NOTIFY pgrst, 'reload schema';
    """)


def downgrade() -> None:
    has_five_minute = op.get_bind().exec_driver_sql(
        "select exists(select 1 from public.telemetry_readings "
        "where aggregation = 'five_minute')"
    ).scalar_one()
    if has_five_minute:
        raise RuntimeError(
            "Cannot downgrade while five-minute telemetry history exists."
        )
    op.execute("""
    drop index public.telemetry_rollup_bucket_unique;
    alter table public.telemetry_readings
      drop constraint telemetry_aggregation_check,
      add constraint telemetry_aggregation_check
        check (aggregation in ('raw', 'hourly', 'daily')),
      alter column aggregation type varchar(8);
    create unique index telemetry_rollup_bucket_unique
      on public.telemetry_readings (device_id, aggregation, recorded_at)
      where aggregation in ('hourly', 'daily');
    NOTIFY pgrst, 'reload schema';
    """)
