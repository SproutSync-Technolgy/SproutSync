-- Migration 0015: Multi-Evaluator Persistence, Operator-Scoped Batch Visibility & 1-Click Inline Gold Star Ratings

-- 1. Allow an Operator to have multiple Evaluators and an Evaluator to view granted Operators
--    without unique-constraint collisions on evaluator_id.
alter table public.evaluator_access drop constraint if exists evaluator_access_evaluator_id_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluator_access_owner_email_unique'
  ) then
    alter table public.evaluator_access
      add constraint evaluator_access_owner_email_unique unique (owner_id, evaluator_email);
  end if;
end $$;

-- 2. Trigger on evaluator_access: normalize email, auto-link evaluator_id if user exists,
--    and promote 'pending' user to 'evaluator'.
create or replace function public.sync_evaluator_access_identity()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  matched_user public.users;
begin
  new.evaluator_email := lower(trim(new.evaluator_email));

  if new.evaluator_id is not null then
    select * into matched_user from public.users where id = new.evaluator_id;
  end if;

  if matched_user.id is null and new.evaluator_email <> '' then
    select * into matched_user from public.users where lower(trim(email)) = new.evaluator_email;
  end if;

  if matched_user.id is not null then
    new.evaluator_id := matched_user.id;
    new.evaluator_email := lower(trim(matched_user.email));
    if matched_user.role = 'pending' then
      update public.users set role = 'evaluator', updated_at = now() where id = matched_user.id;
    end if;
  end if;

  if new.granted_at is null then
    new.granted_at := now();
  end if;
  if new.granted_by is null then
    new.granted_by := public.current_profile_id();
  end if;

  return new;
end $$;

drop trigger if exists trg_sync_evaluator_access_identity on public.evaluator_access;
create trigger trg_sync_evaluator_access_identity
before insert or update on public.evaluator_access
for each row execute function public.sync_evaluator_access_identity();

-- 3. Trigger on users: when a new user registers or updates email, link any matching evaluator_access rows
--    and auto-promote 'pending' to 'evaluator'.
create or replace function public.sync_user_evaluator_grants()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.evaluator_access
    where lower(trim(evaluator_email)) = lower(trim(new.email))
  ) then
    update public.evaluator_access
    set evaluator_id = new.id
    where lower(trim(evaluator_email)) = lower(trim(new.email))
      and (evaluator_id is null or evaluator_id <> new.id);

    if new.role = 'pending' then
      update public.users set role = 'evaluator', updated_at = now() where id = new.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_user_evaluator_grants on public.users;
create trigger trg_sync_user_evaluator_grants
after insert or update of email on public.users
for each row execute function public.sync_user_evaluator_grants();

-- Backfill any existing unlinked evaluator_access rows
update public.evaluator_access a
set evaluator_id = u.id
from public.users u
where lower(trim(u.email)) = lower(trim(a.evaluator_email))
  and a.evaluator_id is null;

update public.users u
set role = 'evaluator', updated_at = now()
from public.evaluator_access a
where (u.id = a.evaluator_id or lower(trim(u.email)) = lower(trim(a.evaluator_email)))
  and u.role = 'pending';

-- 4. Update can_view_owner(target) so Evaluators see batches/readings for their granting Operator(s)
--    whether matched by evaluator_id OR evaluator_email.
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
    join public.users u on (
      u.id = a.evaluator_id
      or lower(trim(u.email)) = lower(trim(a.evaluator_email))
    )
    where a.owner_id = target
      and u.id = public.current_profile_id()
      and u.role in ('evaluator', 'pending')
      and u.is_active
  )
$$;

-- 5. Update operator_list_evaluators() to LEFT JOIN users so email-granted evaluators never disappear
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
    coalesce(u.id, -a.id::integer) as id,
    coalesce(nullif(u.display_name, ''), nullif(trim(u.first_name || ' ' || u.last_name), ''), a.evaluator_email) as name,
    coalesce(u.first_name, '') as first_name,
    coalesce(u.last_name, '') as last_name,
    coalesce(u.email, a.evaluator_email) as email,
    coalesce(u.is_active, true) as is_active,
    coalesce(a.granted_at, a.created_at) as granted_at
  from public.evaluator_access a
  left join public.users u on (
    u.id = a.evaluator_id
    or lower(trim(u.email)) = lower(trim(a.evaluator_email))
  )
  where (a.owner_id = public.current_profile_id() or public.is_superadmin())
  order by coalesce(a.granted_at, a.created_at) desc, a.id desc;
$$;

-- 6. Allow 1-click star ratings without mandatory comments & add UNIQUE(evaluator_id, batch_id)
alter table public.evaluations alter column comments set default '';
alter table public.evaluations drop constraint if exists evaluations_comments_check;
alter table public.evaluations add constraint evaluations_comments_check check (length(comments) <= 4000);

delete from public.evaluations e
where e.id not in (
  select max(sub.id)
  from public.evaluations sub
  group by sub.evaluator_id, sub.batch_id
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluations_evaluator_batch_unique'
  ) then
    alter table public.evaluations
      add constraint evaluations_evaluator_batch_unique unique (evaluator_id, batch_id);
  end if;
end $$;

drop policy if exists visible_evaluations on public.evaluations;
create policy visible_evaluations on public.evaluations for select to authenticated
using (
  public.is_superadmin()
  or evaluator_id = public.current_profile_id()
  or exists (
    select 1 from public.batches b
    where b.id = batch_id and public.can_view_owner(b.owner_id)
  )
);

grant update (rating, comments) on public.evaluations to authenticated;
drop policy if exists evaluator_update on public.evaluations;
create policy evaluator_update on public.evaluations for update to authenticated
using (evaluator_id = public.current_profile_id())
with check (
  evaluator_id = public.current_profile_id()
  and exists (
    select 1 from public.batches b
    where b.id = batch_id and public.can_view_owner(b.owner_id)
  )
);

-- 7. RPC for 1-click inline star rating upsert
create or replace function public.rate_batch_inline(
  target_batch_id integer,
  star_rating integer,
  optional_comments text default ''
)
returns public.evaluations
language plpgsql security definer set search_path = '' as $$
declare
  caller_id integer;
  batch_owner integer;
  result public.evaluations;
begin
  caller_id := public.current_profile_id();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if star_rating < 1 or star_rating > 5 then
    raise exception 'Rating must be between 1 and 5 stars';
  end if;

  select owner_id into batch_owner from public.batches where id = target_batch_id;
  if batch_owner is null or not public.can_view_owner(batch_owner) then
    raise exception 'Not authorized to rate this batch';
  end if;

  insert into public.evaluations (evaluator_id, batch_id, rating, comments, created_at)
  values (caller_id, target_batch_id, star_rating, coalesce(optional_comments, ''), now())
  on conflict (evaluator_id, batch_id) do update set
    rating = excluded.rating,
    comments = case
      when excluded.comments <> '' then excluded.comments
      else public.evaluations.comments
    end,
    created_at = now()
  returning * into result;

  insert into public.activity_logs (owner_id, actor_id, action, resource)
  values (
    batch_owner,
    caller_id,
    'rate_batch',
    'batches:' || target_batch_id || ':stars:' || star_rating
  );

  return result;
end $$;

grant execute on function public.rate_batch_inline(integer, integer, text) to authenticated;
notify pgrst, 'reload schema';

