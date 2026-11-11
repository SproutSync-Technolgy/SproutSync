"""Reconcile incoming five-minute history with the deployed adaptive schema.

The incoming 0019 migration was based on 0018 and would create another head
and replace the adaptive aggregation check. Its unapplied changes are moved
after 0023, preserving existing event/minute/five_min records.
"""

from alembic import op

revision = "0024_telemetry_history_compat"
down_revision = "0023_adaptive_telemetry"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
      set local lock_timeout='5s';
      alter table public.telemetry_readings
        alter column aggregation type varchar(16),
        drop constraint telemetry_aggregation_check,
        add constraint telemetry_aggregation_check
          check(aggregation in ('raw','hourly','daily','event','minute','five_min','five_minute'));
      create unique index telemetry_legacy_five_minute_unique
        on public.telemetry_readings(device_id,recorded_at)
        where aggregation='five_minute';
    """)
    op.execute("""
      create or replace function public.workspace_live_snapshot(after_id bigint default null)
      returns jsonb language plpgsql stable security invoker set search_path='' as $$
      declare result jsonb;
      begin
        if after_id < 0 then raise exception using errcode='22023',message='History cursor must be nonnegative'; end if;
        if not exists(select 1 from public.users u where u.id=public.current_profile_id()
          and u.is_active and u.role in ('operator','evaluator','admin','superadmin')) then
          return jsonb_build_object('devices','[]'::jsonb,'readings','[]'::jsonb,
            'latest_readings','[]'::jsonb,'minute_previews','[]'::jsonb,'mqtt',null,'stale_seconds',30);
        end if;
        select jsonb_build_object(
          'devices',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.devices d),'[]'::jsonb),
          'readings',coalesce((select jsonb_agg(to_jsonb(r)) from (
            select t.* from public.telemetry_readings t
            where t.aggregation in ('raw','event','minute','five_min','five_minute') and (after_id is null or t.id>after_id)
            order by case when after_id is null then t.id end desc,
                     case when after_id is not null then t.id end asc,t.id desc limit 1000
          ) r),'[]'::jsonb),
          'latest_readings',coalesce((select jsonb_agg(s.latest) from public.device_live_state s),'[]'::jsonb),
          'minute_previews',coalesce((select jsonb_agg(s.minute_preview) from public.device_live_state s
            where s.received_at >= now()-make_interval(secs=>s.stale_seconds)
              and (s.minute_preview->>'window_started_at')::timestamptz = date_trunc('minute',now())),'[]'::jsonb),
          'stale_seconds',coalesce((select max(s.stale_seconds) from public.device_live_state s),30),
          'mqtt',null
        ) into result;
        return result;
      end $$;
      notify pgrst,'reload schema';
    """)


def downgrade():
    if (
        op.get_bind()
        .exec_driver_sql(
            "select exists(select 1 from public.telemetry_readings where aggregation='five_minute')"
        )
        .scalar_one()
    ):
        raise RuntimeError("Preserve legacy five-minute history before downgrading.")
    op.execute("""
      drop index public.telemetry_legacy_five_minute_unique;
      alter table public.telemetry_readings
        drop constraint telemetry_aggregation_check,
        add constraint telemetry_aggregation_check
          check(aggregation in ('raw','hourly','daily','event','minute','five_min')),
        alter column aggregation type varchar(8);
      notify pgrst,'reload schema';
    """)
