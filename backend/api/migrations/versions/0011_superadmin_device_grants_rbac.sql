-- Sprint 1: Superadmin role, device serial grants, strict RLS without demo fallback, and audit logging.

-- 1. Add grant audit columns to devices and evaluator_access
alter table public.devices add column if not exists granted_by integer references public.users(id);
alter table public.devices add column if not exists granted_at timestamptz default now();

alter table public.evaluator_access add column if not exists granted_by integer references public.users(id);
alter table public.evaluator_access add column if not exists granted_at timestamptz default now();

-- 2. Create is_superadmin() function
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.users
    where id = public.current_profile_id()
      and role in ('superadmin', 'admin')
      and is_active
  )
$$;

-- 3. Update is_operator() to also recognize superadmin
create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.users
    where id = public.current_profile_id()
      and role in ('operator', 'admin', 'superadmin')
      and is_active
  )
$$;

-- 4. Replace can_view_owner(target integer) so:
--    - Superadmin can view any owner's records.
--    - Operators can view their own records.
--    - Evaluators can view only records from Operators who explicitly granted them access.
--    - Ungranted Evaluators or users with zero grants see NOTHING (sproutsync-demo-workspace fallback removed).
create or replace function public.can_view_owner(target integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_superadmin()
  or (
    target = public.current_profile_id()
    and (
      exists(select 1 from public.devices d where d.owner_id = target)
      or public.is_operator()
    )
  )
  or exists (
    select 1 from public.evaluator_access a
    join public.users u on lower(u.email) = a.evaluator_email
    where a.owner_id = target
      and u.id = public.current_profile_id()
      and u.role = 'evaluator'
  )
$$;

-- 5. Update evaluator_access RLS policy so Evaluators can read their own grants, and Superadmin can read all
drop policy if exists access_owner_read on public.evaluator_access;
create policy access_owner_read on public.evaluator_access for select to authenticated
using (
  owner_id = public.current_profile_id()
  or evaluator_email = (select lower(email) from public.users where id = public.current_profile_id())
  or public.is_superadmin()
);

-- 6. Update evaluations RLS policy so Superadmins can audit all evaluations across the fleet
drop policy if exists visible_evaluations on public.evaluations;
create policy visible_evaluations on public.evaluations for select to authenticated
using (
  public.is_superadmin()
  or evaluator_id = public.current_profile_id()
  or exists (
    select 1 from public.batches b
    where b.id = batch_id and b.owner_id = public.current_profile_id()
  )
);

-- 7. Superadmin Account Management RPC
create or replace function public.superadmin_update_account(
  target_user_id integer,
  new_email text,
  new_first_name text,
  new_last_name text,
  new_role text,
  new_organization text default ''
)
returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  result public.users;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;

  if trim(new_role) not in ('superadmin', 'admin', 'operator', 'evaluator') then
    raise exception 'Invalid role: %', new_role;
  end if;

  if length(trim(new_first_name)) < 1 or length(trim(new_first_name)) > 80 then
    raise exception 'First name must be between 1 and 80 characters';
  end if;

  update public.users set
    email = lower(trim(new_email)),
    first_name = trim(new_first_name),
    last_name = trim(new_last_name),
    display_name = trim(trim(new_first_name) || ' ' || trim(new_last_name)),
    role = trim(new_role),
    organization = trim(new_organization),
    updated_at = now()
  where id = target_user_id
  returning * into result;

  if result.id is null then
    raise exception 'User not found';
  end if;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values(
    target_user_id,
    public.current_profile_id(),
    'superadmin_account_update',
    'users:' || target_user_id || ':' || trim(new_role)
  );

  return result;
end $$;

-- 8. Superadmin Serial ID Grant RPC
create or replace function public.superadmin_grant_serial(
  operator_user_id integer,
  device_serial text,
  device_name text
)
returns public.devices
language plpgsql security definer set search_path = '' as $$
declare
  result public.devices;
  clean_serial text;
  clean_name text;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;

  if not exists (
    select 1 from public.users
    where id = operator_user_id and role in ('operator', 'admin', 'superadmin')
  ) then
    raise exception 'Target user must be an active operator or admin';
  end if;

  clean_serial := upper(trim(device_serial));
  clean_name := trim(device_name);

  if length(clean_serial) < 1 or length(clean_serial) > 64 then
    raise exception 'Invalid serial number length';
  end if;

  if length(clean_name) < 1 or length(clean_name) > 120 then
    clean_name := 'Chamber Controller ' || clean_serial;
  end if;

  insert into public.devices (
    owner_id,
    serial_number,
    name,
    status,
    granted_by,
    granted_at
  )
  values (
    operator_user_id,
    clean_serial,
    clean_name,
    'online',
    public.current_profile_id(),
    now()
  )
  on conflict (serial_number) do update set
    owner_id = excluded.owner_id,
    name = excluded.name,
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at,
    status = 'online'
  returning * into result;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    operator_user_id,
    public.current_profile_id(),
    'grant_serial_id',
    'devices:' || clean_serial || '->user:' || operator_user_id
  );

  return result;
end $$;

-- 9. Superadmin Serial Revocation RPC
create or replace function public.superadmin_revoke_serial(target_device_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  dev public.devices;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;

  select * into dev from public.devices where id = target_device_id;
  if dev.id is null then
    raise exception 'Device not found';
  end if;

  delete from public.devices where id = target_device_id;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    dev.owner_id,
    public.current_profile_id(),
    'revoke_serial_id',
    'devices:' || dev.serial_number
  );
end $$;

-- 10. Audit Logging Trigger on evaluator_access
create or replace function public.record_evaluator_access_activity()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.activity_logs(owner_id, actor_id, action, resource)
    values(new.owner_id, public.current_profile_id(), 'grant_evaluator_access', 'evaluator:' || new.evaluator_email);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.activity_logs(owner_id, actor_id, action, resource)
    values(old.owner_id, public.current_profile_id(), 'revoke_evaluator_access', 'evaluator:' || old.evaluator_email);
    return old;
  end if;
  return null;
end $$;

drop trigger if exists evaluator_access_audit on public.evaluator_access;
create trigger evaluator_access_audit
after insert or delete on public.evaluator_access
for each row execute function public.record_evaluator_access_activity();

-- 11. Grant execute permissions on functions to authenticated users
revoke all on function public.is_superadmin(),
  public.superadmin_update_account(integer, text, text, text, text, text),
  public.superadmin_grant_serial(integer, text, text),
  public.superadmin_revoke_serial(bigint),
  public.record_evaluator_access_activity()
from public, anon;

grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.superadmin_update_account(integer, text, text, text, text, text) to authenticated;
grant execute on function public.superadmin_grant_serial(integer, text, text) to authenticated;
grant execute on function public.superadmin_revoke_serial(bigint) to authenticated;

notify pgrst, 'reload schema';
