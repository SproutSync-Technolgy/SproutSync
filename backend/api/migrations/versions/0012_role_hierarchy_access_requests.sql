-- Migration 0012: Role Hierarchy, Access Requests, Single-Operator Evaluator Linking & Audit
-- Roles: 'superadmin' -> 'operator' -> 'evaluator' (with 'pending' as default for new accounts)

-- 1. Migrate any remaining 'admin' roles to 'superadmin' and set default role to 'pending'
update public.users set role = 'superadmin' where role = 'admin';
alter table public.users alter column role set default 'pending';

-- 2. Update is_superadmin() and is_operator() helpers
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.users
    where id = public.current_profile_id()
      and role in ('superadmin', 'admin')
      and is_active
  )
$$;

create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.users
    where id = public.current_profile_id()
      and role in ('operator', 'superadmin', 'admin')
      and is_active
  )
$$;

-- 3. Update evaluator_access: add evaluator_id with foreign key and unique constraint
alter table public.evaluator_access add column if not exists evaluator_id integer references public.users(id) on delete cascade;

-- Backfill evaluator_id from matching email
update public.evaluator_access a
set evaluator_id = u.id
from public.users u
where lower(trim(u.email)) = lower(trim(a.evaluator_email))
  and a.evaluator_id is null;

-- Delete dangling evaluator_access rows that have no valid user match
delete from public.evaluator_access where evaluator_id is null;

-- Enforce 1-to-1: one Evaluator belongs to exactly one Operator. Deduplicate keeping latest grant.
delete from public.evaluator_access a
where a.id not in (
  select max(sub.id)
  from public.evaluator_access sub
  group by sub.evaluator_id
);

-- Add unique constraint on evaluator_id
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluator_access_evaluator_id_key'
  ) then
    alter table public.evaluator_access add constraint evaluator_access_evaluator_id_key unique (evaluator_id);
  end if;
end $$;

-- 4. Update can_view_owner so:
--    - Superadmin can view any owner's records.
--    - Operators can view their own records (if they own devices or are active operators).
--    - Evaluators can view only records from the Operator linked via evaluator_access (by evaluator_id).
--    - Pending users return false everywhere and see 0 records.
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
    join public.users u on u.id = a.evaluator_id
    where a.owner_id = target
      and a.evaluator_id = public.current_profile_id()
      and u.role = 'evaluator'
      and u.is_active
  )
$$;

-- 5. Access Requests Table
create table if not exists public.access_requests (
  id serial primary key,
  evaluator_id integer not null references public.users(id) on delete cascade,
  operator_id integer not null references public.users(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'declined')) default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists ix_access_requests_operator_status on public.access_requests(operator_id, status);
create index if not exists ix_access_requests_evaluator_status on public.access_requests(evaluator_id, status);

alter table public.access_requests enable row level security;

drop policy if exists access_requests_policy on public.access_requests;
create policy access_requests_policy on public.access_requests for select to authenticated
using (
  evaluator_id = public.current_profile_id()
  or operator_id = public.current_profile_id()
  or public.is_superadmin()
);

-- 6. RPC: Request operator access (invoked by pending user)
create or replace function public.request_operator_access(operator_email text)
returns public.access_requests
language plpgsql security definer set search_path = '' as $$
declare
  caller_id integer;
  caller_role text;
  target_operator record;
  result public.access_requests;
begin
  caller_id := public.current_profile_id();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select role into caller_role from public.users where id = caller_id and is_active;
  if caller_role is null or caller_role not in ('pending', 'evaluator') then
    raise exception 'Only pending or unassigned users can request operator access';
  end if;

  select id, email into target_operator
  from public.users
  where lower(trim(email)) = lower(trim(operator_email))
    and role in ('operator', 'superadmin', 'admin')
    and is_active;

  if target_operator.id is null then
    raise exception 'No active operator found with email %', operator_email;
  end if;

  -- Cancel previous pending requests from this user
  update public.access_requests
  set status = 'declined', decided_at = now()
  where evaluator_id = caller_id and status = 'pending';

  insert into public.access_requests(evaluator_id, operator_id, status, created_at)
  values (caller_id, target_operator.id, 'pending', now())
  returning * into result;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    target_operator.id,
    caller_id,
    'request_operator_access',
    'access_requests:' || result.id || '->operator:' || target_operator.id
  );

  return result;
end $$;

-- 7. RPC: Operator approves request (sets role='evaluator' & inserts evaluator_access in one transaction)
create or replace function public.operator_approve_request(request_id integer)
returns public.access_requests
language plpgsql security definer set search_path = '' as $$
declare
  caller_id integer;
  req record;
  eval_user record;
  result public.access_requests;
begin
  caller_id := public.current_profile_id();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into req from public.access_requests where id = request_id;
  if req.id is null then
    raise exception 'Access request not found';
  end if;

  if not (public.is_superadmin() or req.operator_id = caller_id) then
    raise exception 'Not authorized to approve this request';
  end if;

  select id, email into eval_user from public.users where id = req.evaluator_id and is_active;
  if eval_user.id is null then
    raise exception 'Requesting user not found or inactive';
  end if;

  -- Update request to approved
  update public.access_requests
  set status = 'approved', decided_at = now()
  where id = request_id
  returning * into result;

  -- Set user role to evaluator
  update public.users
  set role = 'evaluator', updated_at = now()
  where id = req.evaluator_id;

  -- Insert or update evaluator_access (enforcing single-operator link)
  insert into public.evaluator_access (owner_id, evaluator_id, evaluator_email, granted_by, granted_at)
  values (req.operator_id, req.evaluator_id, eval_user.email, caller_id, now())
  on conflict (evaluator_id) do update set
    owner_id = excluded.owner_id,
    evaluator_email = excluded.evaluator_email,
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    req.operator_id,
    caller_id,
    'approve_access_request',
    'access_requests:' || request_id || '->evaluator:' || req.evaluator_id
  );

  return result;
end $$;

-- 8. RPC: Operator declines request
create or replace function public.operator_decline_request(request_id integer)
returns public.access_requests
language plpgsql security definer set search_path = '' as $$
declare
  caller_id integer;
  req record;
  result public.access_requests;
begin
  caller_id := public.current_profile_id();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into req from public.access_requests where id = request_id;
  if req.id is null then
    raise exception 'Access request not found';
  end if;

  if not (public.is_superadmin() or req.operator_id = caller_id) then
    raise exception 'Not authorized to decline this request';
  end if;

  update public.access_requests
  set status = 'declined', decided_at = now()
  where id = request_id
  returning * into result;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    req.operator_id,
    caller_id,
    'decline_access_request',
    'access_requests:' || request_id || '->evaluator:' || req.evaluator_id
  );

  return result;
end $$;

-- 9. RPC: Operator lists their linked Evaluators
create or replace function public.operator_list_evaluators()
returns table (
  id integer,
  name text,
  first_name text,
  last_name text,
  email text,
  is_active boolean,
  granted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    u.id,
    coalesce(nullif(u.display_name, ''), trim(u.first_name || ' ' || u.last_name), u.email) as name,
    u.first_name,
    u.last_name,
    u.email,
    u.is_active,
    a.granted_at
  from public.evaluator_access a
  join public.users u on u.id = a.evaluator_id
  where (a.owner_id = public.current_profile_id() or public.is_superadmin())
  order by u.id asc;
$$;

-- 10. RPC: Operator updates their linked Evaluator's name and email
create or replace function public.operator_update_evaluator(
  target_evaluator_id integer,
  new_first_name text,
  new_last_name text,
  new_email text
)
returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  caller_id integer;
  result public.users;
  clean_email text;
  clean_first text;
  clean_last text;
begin
  caller_id := public.current_profile_id();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.is_superadmin()
    or exists (
      select 1 from public.evaluator_access
      where evaluator_id = target_evaluator_id and owner_id = caller_id
    )
  ) then
    raise exception 'Not authorized to update this evaluator';
  end if;

  clean_email := lower(trim(new_email));
  clean_first := trim(new_first_name);
  clean_last := trim(new_last_name);

  if length(clean_first) < 1 or length(clean_first) > 80 then
    raise exception 'First name must be between 1 and 80 characters';
  end if;
  if length(clean_email) < 3 or clean_email not like '%@%' then
    raise exception 'Invalid email address';
  end if;

  update public.users set
    first_name = clean_first,
    last_name = clean_last,
    display_name = trim(clean_first || ' ' || clean_last),
    email = clean_email,
    updated_at = now()
  where id = target_evaluator_id
  returning * into result;

  if result.id is null then
    raise exception 'Evaluator not found';
  end if;

  update public.evaluator_access set
    evaluator_email = clean_email
  where evaluator_id = target_evaluator_id;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    caller_id,
    caller_id,
    'operator_update_evaluator',
    'users:' || target_evaluator_id || ':' || clean_email
  );

  return result;
end $$;

-- 11. RPC: Superadmin assigns or reassigns Evaluator to an Operator
create or replace function public.superadmin_assign_evaluator(
  target_evaluator_id integer,
  target_operator_id integer
)
returns public.evaluator_access
language plpgsql security definer set search_path = '' as $$
declare
  result public.evaluator_access;
  eval_user record;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;

  if not exists (
    select 1 from public.users
    where id = target_operator_id and role in ('operator', 'superadmin', 'admin') and is_active
  ) then
    raise exception 'Target operator not found or inactive';
  end if;

  select id, email into eval_user
  from public.users
  where id = target_evaluator_id and is_active;

  if eval_user.id is null then
    raise exception 'Target evaluator not found or inactive';
  end if;

  -- Ensure role is evaluator
  update public.users set
    role = 'evaluator',
    updated_at = now()
  where id = target_evaluator_id;

  -- Enforce 1-to-1 link
  insert into public.evaluator_access (
    owner_id,
    evaluator_id,
    evaluator_email,
    granted_by,
    granted_at
  )
  values (
    target_operator_id,
    target_evaluator_id,
    eval_user.email,
    public.current_profile_id(),
    now()
  )
  on conflict (evaluator_id) do update set
    owner_id = excluded.owner_id,
    evaluator_email = excluded.evaluator_email,
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at
  returning * into result;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values (
    target_operator_id,
    public.current_profile_id(),
    'superadmin_assign_evaluator',
    'evaluator:' || target_evaluator_id || '->operator:' || target_operator_id
  );

  return result;
end $$;

-- 12. RPC: Superadmin updates account with Last-Superadmin Demotion Guard
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
  target_curr record;
  superadmin_count integer;
  result public.users;
  clean_email text;
  clean_role text;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin access required';
  end if;

  select id, role into target_curr from public.users where id = target_user_id;
  if target_curr.id is null then
    raise exception 'User not found';
  end if;

  clean_role := trim(new_role);
  if clean_role not in ('superadmin', 'operator', 'evaluator', 'pending') then
    raise exception 'Invalid role: %', new_role;
  end if;

  -- Block demoting the last superadmin
  if target_curr.role in ('superadmin', 'admin') and clean_role not in ('superadmin', 'admin') then
    select count(*) into superadmin_count
    from public.users
    where role in ('superadmin', 'admin') and is_active;

    if superadmin_count <= 1 then
      raise exception 'Cannot demote the last superadmin';
    end if;
  end if;

  if length(trim(new_first_name)) < 1 or length(trim(new_first_name)) > 80 then
    raise exception 'First name must be between 1 and 80 characters';
  end if;

  clean_email := lower(trim(new_email));

  update public.users set
    email = clean_email,
    first_name = trim(new_first_name),
    last_name = trim(new_last_name),
    display_name = trim(trim(new_first_name) || ' ' || trim(new_last_name)),
    role = clean_role,
    organization = trim(new_organization),
    updated_at = now()
  where id = target_user_id
  returning * into result;

  -- Keep evaluator_access synced if this user is linked as an evaluator
  update public.evaluator_access set
    evaluator_email = clean_email
  where evaluator_id = target_user_id;

  insert into public.activity_logs(owner_id, actor_id, action, resource)
  values(
    target_user_id,
    public.current_profile_id(),
    'superadmin_account_update',
    'users:' || target_user_id || ':' || clean_role
  );

  return result;
end $$;

NOTIFY pgrst, 'reload schema';

