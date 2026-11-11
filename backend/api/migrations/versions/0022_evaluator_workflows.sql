-- One operator can grant many distinct evaluator accounts. Repeated grants are
-- successful no-ops, not duplicate rows or a reassignment of another operator.
alter table public.evaluator_access drop constraint if exists evaluator_access_evaluator_id_key;

create or replace function public.grant_evaluator_access(target_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor integer := public.current_profile_id();
  clean_email text := lower(trim(target_email));
  target public.users;
  result public.evaluator_access;
  already boolean := false;
begin
  if actor is null or not public.is_operator() then
    raise exception using errcode='42501', message='Operator access required';
  end if;
  if clean_email is null or length(clean_email) > 320
     or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode='22023', message='Enter a valid evaluator email address';
  end if;
  select * into target from public.users where lower(trim(email))=clean_email;
  if target.id is not null and (not target.is_active or target.role not in ('pending','evaluator')) then
    raise exception using errcode='22023', message='Choose an active evaluator or an unassigned account';
  end if;
  insert into public.evaluator_access(owner_id,evaluator_email,evaluator_id,granted_by,granted_at)
  values(actor,clean_email,target.id,actor,now())
  on conflict (owner_id,evaluator_email) do nothing returning * into result;
  if result.id is null then
    already := true;
    select * into result from public.evaluator_access
      where owner_id=actor and evaluator_email=clean_email;
  end if;
  if target.id is not null and result.evaluator_id is distinct from target.id then
    update public.evaluator_access set evaluator_id=target.id where id=result.id returning * into result;
  end if;
  if target.role='pending' then
    update public.users set role='evaluator',updated_at=now() where id=target.id and role='pending';
  end if;
  return jsonb_build_object('access',to_jsonb(result),'already_granted',already);
end $$;

create or replace function public.operator_list_evaluators()
returns table(id integer,name text,first_name text,last_name text,email text,is_active boolean,granted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_operator() then
    raise exception using errcode='42501',message='Operator access required';
  end if;
  return query select coalesce(u.id,-a.id::integer),
    coalesce(nullif(u.display_name,''),a.evaluator_email)::text,
    coalesce(u.first_name,'')::text,coalesce(u.last_name,'')::text,coalesce(u.email,a.evaluator_email)::text,
    coalesce(u.is_active,true),coalesce(a.granted_at,a.created_at)
  from public.evaluator_access a
  left join public.users u on u.id=a.evaluator_id
  where a.owner_id=public.current_profile_id()
  order by coalesce(a.granted_at,a.created_at) desc,a.id desc;
end $$;

create or replace function public.operator_list_access_requests()
returns table(id integer,evaluator_id integer,operator_id integer,status text,
  evaluator_name text,evaluator_email text,created_at timestamptz,decided_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_operator() then
    raise exception using errcode='42501',message='Operator access required';
  end if;
  return query select r.id,r.evaluator_id,r.operator_id,r.status::text,
    u.display_name::text,u.email::text,r.created_at,r.decided_at
  from public.access_requests r join public.users u on u.id=r.evaluator_id
  where r.operator_id=public.current_profile_id() and r.status='pending'
  order by r.created_at desc,r.id desc;
end $$;

create or replace function public.operator_approve_request(request_id integer)
returns public.access_requests language plpgsql security definer set search_path = '' as $$
declare
  actor integer := public.current_profile_id();
  req public.access_requests;
  target public.users;
begin
  if actor is null or not public.is_operator() then
    raise exception using errcode='42501',message='Operator access required';
  end if;
  select * into req from public.access_requests where id=request_id for update;
  if req.id is null or (req.operator_id<>actor and not public.is_superadmin()) then
    raise exception using errcode='42501',message='Access request is not available in your workspace';
  end if;
  select * into target from public.users where id=req.evaluator_id and is_active for update;
  if target.id is null or target.role not in ('pending','evaluator') then
    raise exception using errcode='22023',message='Requester must be an active evaluator or unassigned account';
  end if;
  if req.status='approved' then return req; end if;
  if req.status<>'pending' then
    raise exception using errcode='22023',message='This request has already been decided';
  end if;
  insert into public.evaluator_access(owner_id,evaluator_email,evaluator_id,granted_by,granted_at)
  values(req.operator_id,lower(trim(target.email)),target.id,actor,now())
  on conflict(owner_id,evaluator_email) do update set evaluator_id=excluded.evaluator_id;
  update public.users set role='evaluator',updated_at=now() where id=target.id and role='pending';
  update public.access_requests set status='approved',decided_at=now() where id=req.id returning * into req;
  insert into public.activity_logs(owner_id,actor_id,action,resource)
    values(req.operator_id,actor,'approve_access_request','access_requests:'||req.id);
  return req;
end $$;

create or replace function public.operator_decline_request(request_id integer)
returns public.access_requests language plpgsql security definer set search_path = '' as $$
declare
  actor integer := public.current_profile_id();
  req public.access_requests;
begin
  if actor is null or not public.is_operator() then
    raise exception using errcode='42501',message='Operator access required';
  end if;
  select * into req from public.access_requests where id=request_id for update;
  if req.id is null or (req.operator_id<>actor and not public.is_superadmin()) then
    raise exception using errcode='42501',message='Access request is not available in your workspace';
  end if;
  if req.status='declined' then return req; end if;
  if req.status<>'pending' then
    raise exception using errcode='22023',message='This request has already been decided';
  end if;
  update public.access_requests set status='declined',decided_at=now() where id=req.id returning * into req;
  insert into public.activity_logs(owner_id,actor_id,action,resource)
    values(req.operator_id,actor,'decline_access_request','access_requests:'||req.id);
  return req;
end $$;

revoke all on function public.grant_evaluator_access(text),public.operator_list_evaluators(),
  public.operator_list_access_requests(),public.operator_approve_request(integer),
  public.operator_decline_request(integer),public.request_operator_access(text) from public,anon;
grant execute on function public.grant_evaluator_access(text),public.operator_list_evaluators(),
  public.operator_list_access_requests(),public.operator_approve_request(integer),
  public.operator_decline_request(integer),public.request_operator_access(text) to authenticated;
notify pgrst,'reload schema';
