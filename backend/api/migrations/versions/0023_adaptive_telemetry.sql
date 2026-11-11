set local lock_timeout='5s';
alter table public.telemetry_readings
  drop constraint telemetry_aggregation_check,
  add constraint telemetry_aggregation_check check(aggregation in ('raw','hourly','daily','event','minute','five_min')),
  add column metric_stats jsonb not null default '{}',
  add column window_started_at timestamptz,
  add column window_ended_at timestamptz;
create unique index telemetry_adaptive_bucket_unique
  on public.telemetry_readings(device_id,aggregation,recorded_at)
  where aggregation in ('minute','five_min');

create table public.device_live_state (
  device_id integer primary key,
  owner_id integer not null,
  received_at timestamptz not null,
  latest jsonb not null default '{}',
  minute_preview jsonb not null default '{}',
  history_state jsonb not null default '{}',
  flush_at timestamptz,
  stale_seconds integer not null default 30 check(stale_seconds between 5 and 3600),
  foreign key(device_id,owner_id) references public.devices(id,owner_id) on delete cascade
);
create index device_live_owner on public.device_live_state(owner_id);
create index device_live_flush on public.device_live_state(flush_at) where flush_at is not null;
alter table public.device_live_state enable row level security;
revoke all on public.device_live_state from public,anon,authenticated;
grant select(device_id,owner_id,received_at,latest,minute_preview,stale_seconds)
  on public.device_live_state to authenticated;
create policy visible_live_state on public.device_live_state for select to authenticated
  using(public.can_view_owner(owner_id));

-- Drop transient data at a binding change; a former owner must never retain
-- access to the next owner's packet or contribute to the next binding's mean.
create function public.clear_device_live_state() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.mqtt_topic_prefix is distinct from old.mqtt_topic_prefix
     or new.connection_requested_at is distinct from old.connection_requested_at then
    delete from public.device_live_state where device_id=old.id;
  end if;
  return new;
end $$;
revoke all on function public.clear_device_live_state() from public,anon,authenticated;
create trigger clear_live_state_binding before update of owner_id,mqtt_topic_prefix,connection_requested_at
  on public.devices for each row execute function public.clear_device_live_state();

create function public.workspace_live_snapshot(after_id bigint default null)
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
      where t.aggregation in ('raw','event','minute','five_min') and (after_id is null or t.id>after_id)
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
revoke all on function public.workspace_live_snapshot(bigint) from public,anon;
grant execute on function public.workspace_live_snapshot(bigint) to authenticated;
notify pgrst,'reload schema';
