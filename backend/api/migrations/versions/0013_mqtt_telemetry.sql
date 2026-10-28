-- Existing devices remain unbound until an operator explicitly connects one.
alter table public.devices add column mqtt_topic_prefix varchar(160) unique
  check (mqtt_topic_prefix ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$');
alter table public.devices add column connection_requested_at timestamptz;
alter table public.telemetry_readings add column received_at timestamptz not null default now();
-- Historical rows have no separately measured receipt time; use their recorded time.
update public.telemetry_readings set received_at = recorded_at;
alter table public.telemetry_readings add column voltage double precision check(voltage >= 0 and voltage <= 100);
alter table public.telemetry_readings add column sd_ok boolean;
alter table public.telemetry_readings add column sensor_status varchar(120) not null default 'NONE';
alter table public.telemetry_readings add column message_id varchar(128);
alter table public.telemetry_readings add constraint telemetry_device_message_unique unique(device_id, message_id);
create index telemetry_device_recent on public.telemetry_readings(device_id, recorded_at desc, id desc);

-- Legacy grant RPCs also pass through this guard: granting access is not detection.
create function public.guard_device_connection() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    new.mqtt_topic_prefix := null;
    new.connection_requested_at := null;
    new.last_seen_at := null;
    new.status := 'pending';
  end if;
  if not new.is_demo and new.status in ('online', 'fault')
    and (new.mqtt_topic_prefix is null or new.last_seen_at is null) then
    new.status := 'pending';
  end if;
  return new;
end $$;
create trigger device_connection_guard before insert or update on public.devices
for each row execute function public.guard_device_connection();
update public.devices set status = 'pending' where not is_demo and status in ('online', 'fault');

-- Connection state and telemetry are written only through the server.
-- Existing SELECT policies continue to restrict realtime packets to visible owners.
do $$
declare tbl text;
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['devices', 'telemetry_readings'] loop
      if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end $$;
NOTIFY pgrst, 'reload schema';
