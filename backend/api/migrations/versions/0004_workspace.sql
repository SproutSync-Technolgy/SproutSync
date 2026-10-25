-- Additive migration for the existing public.users and public.batches schema.
alter table public.users add column first_name text not null default '';
alter table public.users add column last_name text not null default '';
alter table public.users add column organization text not null default '';
alter table public.users add column phone text not null default '';
alter table public.users add column profile_complete boolean not null default false;
alter table public.users alter column role set default 'evaluator';

create table public.evaluator_access (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  evaluator_email text not null check (evaluator_email = lower(trim(evaluator_email))),
  created_at timestamptz not null default now(),
  unique(owner_id, evaluator_email)
);

create or replace function public.current_profile_id() returns integer
language sql stable security definer set search_path = '' as $$
  select id from public.users where google_subject = auth.uid()::text and is_active
$$;
create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users where id = public.current_profile_id() and role in ('operator','admin'))
$$;
create or replace function public.can_view_owner(target integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select target = public.current_profile_id() or exists (
    select 1 from public.evaluator_access a join public.users u on lower(u.email) = a.evaluator_email
    where a.owner_id = target and u.id = public.current_profile_id() and u.role = 'evaluator'
  )
$$;

-- Profile creation is a verified-session RPC; the browser cannot assign roles.
create or replace function public.ensure_profile() returns public.users
language plpgsql security definer set search_path = '' as $$
declare account auth.users; result public.users;
begin
  select * into account from auth.users where id = auth.uid();
  if account.id is null or account.email_confirmed_at is null then
    raise exception 'Verify your email before continuing';
  end if;
  select * into result from public.users where google_subject = account.id::text;
  if result.id is null then
    -- Preserve existing operator assignments when linking a verified legacy identity.
    select * into result from public.users where lower(email) = lower(account.email);
    if result.id is not null then
      update public.users set google_subject = account.id::text where id = result.id returning * into result;
    else
      insert into public.users (google_subject, email, display_name, role, is_active)
      values (account.id::text, lower(account.email), '', 'evaluator', true) returning * into result;
    end if;
  end if;
  if not result.is_active then raise exception 'Your account is inactive'; end if;
  return result;
end $$;

create or replace function public.save_profile(given_name text, family_name text, company text default '', contact_phone text default '')
returns public.users language plpgsql security definer set search_path = '' as $$
declare result public.users;
begin
  if length(trim(given_name)) not between 1 and 80 or length(trim(family_name)) not between 1 and 80
    or length(company) > 160 or length(contact_phone) > 40 then raise exception 'Check your personal details'; end if;
  perform public.ensure_profile();
  update public.users set first_name = trim(given_name), last_name = trim(family_name),
    display_name = trim(given_name) || ' ' || trim(family_name), organization = trim(company),
    phone = trim(contact_phone), profile_complete = true, updated_at = now()
  where id = public.current_profile_id() returning * into result;
  return result;
end $$;

create table public.devices (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  name text not null check(length(name) between 1 and 120),
  serial_number text not null unique,
  status text not null default 'pending' check(status in ('pending','online','offline','fault')),
  last_seen_at timestamptz,
  firmware_version text,
  created_at timestamptz not null default now(),
  unique(id, owner_id)
);
create table public.trays (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  device_id bigint not null,
  position integer not null check(position > 0),
  status text not null default 'idle' check(status in ('idle','active','maintenance')),
  unique(device_id, position), unique(id, owner_id),
  foreign key(device_id, owner_id) references public.devices(id, owner_id)
);
alter table public.batches add constraint batches_id_owner_unique unique(id, owner_id);
alter table public.batches add column tray_id bigint;
alter table public.batches add constraint batches_tray_owner foreign key(tray_id, owner_id) references public.trays(id, owner_id);

create table public.telemetry_readings (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  device_id bigint not null,
  temperature_c double precision,
  humidity_percent double precision check(humidity_percent between 0 and 100),
  water_level_percent double precision check(water_level_percent between 0 and 100),
  recorded_at timestamptz not null default now(),
  foreign key(device_id, owner_id) references public.devices(id, owner_id)
);
create table public.irrigation_schedules (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  device_id bigint not null,
  next_run_at timestamptz not null,
  duration_seconds integer not null check(duration_seconds between 1 and 600),
  enabled boolean not null default true,
  foreign key(device_id, owner_id) references public.devices(id, owner_id)
);
create table public.watering_events (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  batch_id integer,
  device_id bigint not null,
  volume_ml double precision not null check(volume_ml >= 0),
  duration_seconds integer not null check(duration_seconds > 0),
  occurred_at timestamptz not null default now(),
  foreign key(batch_id, owner_id) references public.batches(id, owner_id),
  foreign key(device_id, owner_id) references public.devices(id, owner_id)
);
create table public.alerts (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  device_id bigint,
  title text not null,
  message text not null,
  recommended_action text not null default '',
  severity text not null check(severity in ('info','warning','critical')),
  status text not null default 'open' check(status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  foreign key(device_id, owner_id) references public.devices(id, owner_id)
);
create table public.evidence_records (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  batch_id integer,
  category text not null check(category in ('calibration','irrigation','safety','offline_sync')),
  title text not null check(length(title) between 1 and 200),
  result text not null check(result in ('passed','failed','pending')),
  notes text not null default '',
  recorded_at timestamptz not null default now(),
  foreign key(batch_id, owner_id) references public.batches(id, owner_id)
);
create table public.evaluations (
  id bigint generated always as identity primary key,
  evaluator_id integer not null references public.users(id),
  batch_id integer not null references public.batches(id),
  rating integer not null check(rating between 1 and 5),
  comments text not null check(length(comments) between 1 and 4000),
  created_at timestamptz not null default now()
);
create table public.maintenance_records (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  device_id bigint not null,
  notes text not null check(length(notes) between 1 and 2000),
  performed_at timestamptz not null default now(),
  foreign key(device_id, owner_id) references public.devices(id, owner_id)
);
create table public.activity_logs (
  id bigint generated always as identity primary key,
  owner_id integer not null references public.users(id),
  actor_id integer references public.users(id),
  action text not null,
  resource text not null,
  created_at timestamptz not null default now()
);
create table public.notification_preferences (
  user_id integer primary key references public.users(id),
  alerts_enabled boolean not null default true,
  harvest_enabled boolean not null default true
);

-- Restrict every exposed table. Device readings and logs are ingestion-only writes.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.batches enable row level security;
revoke all on public.users, public.sessions, public.batches from anon, authenticated;
grant select on public.users, public.batches to authenticated;
grant insert, update on public.batches to authenticated;
create policy self_profile on public.users for select to authenticated using(id = public.current_profile_id());
create policy visible_batches on public.batches for select to authenticated using(public.can_view_owner(owner_id));
create policy create_batches on public.batches for insert to authenticated with check(owner_id = public.current_profile_id() and public.is_operator());
create policy update_batches on public.batches for update to authenticated using(owner_id = public.current_profile_id() and public.is_operator()) with check(owner_id = public.current_profile_id() and public.is_operator());

do $$ declare tbl text; begin
  foreach tbl in array array['devices','trays','telemetry_readings','irrigation_schedules','watering_events','alerts','evidence_records','maintenance_records','activity_logs'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon, authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('create index on public.%I(owner_id)', tbl);
    execute format('create policy visible_records on public.%I for select to authenticated using(public.can_view_owner(owner_id))', tbl);
  end loop;
  foreach tbl in array array['devices','trays','irrigation_schedules','evidence_records','maintenance_records'] loop
    execute format('grant insert on public.%I to authenticated', tbl);
    execute format('create policy operator_insert on public.%I for insert to authenticated with check(owner_id = public.current_profile_id() and public.is_operator())', tbl);
  end loop;
end $$;
-- Registration cannot manufacture online status; only trusted ingestion sets it.
revoke insert on public.devices from authenticated;
grant insert(owner_id, name, serial_number) on public.devices to authenticated;
grant update(status) on public.alerts to authenticated;
create policy acknowledge_alerts on public.alerts for update to authenticated using(owner_id = public.current_profile_id() and public.is_operator()) with check(owner_id = public.current_profile_id() and public.is_operator());

alter table public.evaluator_access enable row level security;
revoke all on public.evaluator_access from anon, authenticated;
grant select, insert, delete on public.evaluator_access to authenticated;
create policy access_owner_read on public.evaluator_access for select to authenticated using(owner_id = public.current_profile_id());
create policy access_owner_insert on public.evaluator_access for insert to authenticated with check(owner_id = public.current_profile_id() and public.is_operator());
create policy access_owner_delete on public.evaluator_access for delete to authenticated using(owner_id = public.current_profile_id() and public.is_operator());

alter table public.evaluations enable row level security;
revoke all on public.evaluations from anon, authenticated;
grant select, insert on public.evaluations to authenticated;
create policy visible_evaluations on public.evaluations for select to authenticated using(evaluator_id = public.current_profile_id() or exists(select 1 from public.batches b where b.id = batch_id and b.owner_id = public.current_profile_id()));
create policy evaluator_submit on public.evaluations for insert to authenticated with check(
  evaluator_id = public.current_profile_id() and not public.is_operator()
  and exists(select 1 from public.batches b where b.id = batch_id and public.can_view_owner(b.owner_id))
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
create policy own_preferences on public.notification_preferences for all to authenticated using(user_id = public.current_profile_id()) with check(user_id = public.current_profile_id());

create or replace function public.record_workspace_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values(new.owner_id, public.current_profile_id(), lower(tg_op), tg_table_name || ':' || new.id::text);
  return new;
end $$;
create trigger batch_activity after insert or update on public.batches for each row execute function public.record_workspace_activity();
create trigger alert_activity after update on public.alerts for each row execute function public.record_workspace_activity();
create trigger maintenance_activity after insert on public.maintenance_records for each row execute function public.record_workspace_activity();

create index telemetry_recent on public.telemetry_readings(recorded_at desc);
create index alerts_recent on public.alerts(created_at desc);
create index watering_recent on public.watering_events(occurred_at desc);
grant usage, select on all sequences in schema public to authenticated;
revoke all on function public.current_profile_id(), public.is_operator(), public.can_view_owner(integer), public.ensure_profile(), public.save_profile(text,text,text,text), public.record_workspace_activity() from public, anon;
grant execute on function public.current_profile_id(), public.is_operator(), public.can_view_owner(integer), public.ensure_profile(), public.save_profile(text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
