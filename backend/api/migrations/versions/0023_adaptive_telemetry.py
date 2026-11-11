"""Bounded live state and restart-safe, fault-aware telemetry averages."""

from pathlib import Path

from alembic import op
from sqlalchemy import text

revision = "0023_adaptive_telemetry"
down_revision = "0022_evaluator_workflows"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    if op.get_bind().scalar(
        text(
            "select exists(select 1 from public.device_live_state) or exists(select 1 from public.telemetry_readings where aggregation in ('event','minute','five_min'))"
        )
    ):
        raise RuntimeError(
            "Preserve live accumulators and adaptive history; downgrade would discard data."
        )
    op.execute("""
      drop function public.workspace_live_snapshot(bigint);
      drop trigger clear_live_state_binding on public.devices;
      drop function public.clear_device_live_state();
      drop table public.device_live_state;
      drop index public.telemetry_adaptive_bucket_unique;
      alter table public.telemetry_readings drop constraint telemetry_aggregation_check;
      alter table public.telemetry_readings add constraint telemetry_aggregation_check check(aggregation in ('raw','hourly','daily'));
      alter table public.telemetry_readings drop column metric_stats,drop column window_started_at,drop column window_ended_at;
      notify pgrst,'reload schema';
    """)
