"""Store aggregation metadata for bounded telemetry retention."""

from alembic import op
from sqlalchemy import text

revision = "0018_telemetry_rollups"
down_revision = "0017_device_fault_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    alter table public.telemetry_readings
      add column aggregation varchar(8) not null default 'raw',
      add column sample_count integer not null default 1,
      add column fault_count integer not null default 0,
      add column metric_counts json not null default '{}',
      add constraint telemetry_aggregation_check
        check (aggregation in ('raw', 'hourly', 'daily')),
      add constraint telemetry_sample_count_check check (sample_count > 0),
      add constraint telemetry_fault_count_check
        check (fault_count >= 0 and fault_count <= sample_count);

    create index telemetry_compaction
      on public.telemetry_readings (aggregation, recorded_at, device_id);
    create unique index telemetry_rollup_bucket_unique
      on public.telemetry_readings (device_id, aggregation, recorded_at)
      where aggregation in ('hourly', 'daily');
    NOTIFY pgrst, 'reload schema';
    """)


def downgrade() -> None:
    has_rollups = op.get_bind().execute(
        text(
            "select exists(select 1 from public.telemetry_readings "
            "where aggregation <> 'raw')"
        )
    ).scalar_one()
    if has_rollups:
        raise RuntimeError(
            "Cannot downgrade telemetry rollups while aggregated history exists."
        )
    op.execute("""
    drop index public.telemetry_rollup_bucket_unique;
    drop index public.telemetry_compaction;
    alter table public.telemetry_readings
      drop constraint telemetry_aggregation_check,
      drop constraint telemetry_sample_count_check,
      drop constraint telemetry_fault_count_check,
      drop column metric_counts,
      drop column fault_count,
      drop column sample_count,
      drop column aggregation;
    NOTIFY pgrst, 'reload schema';
    """)
