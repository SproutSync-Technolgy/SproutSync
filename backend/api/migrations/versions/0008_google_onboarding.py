"""Prefill Google details and require email possession for new Google onboarding."""

from alembic import op

revision = "0008_google_onboarding"
down_revision = "0007_google_profile_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    alter table public.users add column registration_provider text not null default 'email';
    alter table public.users add column onboarding_email_verified_at timestamptz;
    update public.users u set registration_provider = 'google'
      from auth.users a where a.id::text = u.google_subject
      and (a.raw_app_meta_data->'providers') ? 'google';
    update public.users set onboarding_email_verified_at = now() where profile_complete;

    create or replace function public.ensure_profile() returns public.users
    language plpgsql security definer set search_path = '' as $$
    declare account auth.users; result public.users; provider text; given_name text; family_name text; full_name_value text;
    begin
      select * into account from auth.users where id = auth.uid();
      if account.id is null or account.email_confirmed_at is null then raise exception 'Verify your email before continuing'; end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(account.email),0));
      provider := case when (account.raw_app_meta_data->'providers') ? 'google' then 'google' else 'email' end;
      select * into result from public.users where google_subject = account.id::text;
      if result.id is null then
        select * into result from public.users where lower(email)=lower(account.email);
        if result.id is not null then
          update public.users set google_subject=account.id::text where id=result.id returning * into result;
        else
          insert into public.users(google_subject,email,display_name,role,is_active)
          values(account.id::text,lower(account.email),'','evaluator',true) returning * into result;
        end if;
      end if;
      if not result.is_active then raise exception 'Your account is inactive'; end if;
      if not result.profile_complete and provider='google' then
        full_name_value := coalesce(nullif(account.raw_user_meta_data->>'full_name',''),nullif(account.raw_user_meta_data->>'name',''),'');
        given_name := coalesce(nullif(account.raw_user_meta_data->>'given_name',''),nullif(account.raw_user_meta_data->>'first_name',''),split_part(full_name_value,' ',1));
        family_name := coalesce(nullif(account.raw_user_meta_data->>'family_name',''),nullif(account.raw_user_meta_data->>'last_name',''),nullif(trim(substr(full_name_value,length(given_name)+1)),''),'');
        update public.users set registration_provider='google',
          first_name=case when first_name='' then left(given_name,80) else first_name end,
          last_name=case when last_name='' then left(family_name,80) else last_name end,
          display_name=case when display_name='' then left(full_name_value,200) else display_name end,
          avatar_url=coalesce(avatar_url,account.raw_user_meta_data->>'avatar_url',account.raw_user_meta_data->>'picture')
        where id=result.id returning * into result;
      end if;
      -- AMR is signed by Supabase, unlike user-editable profile metadata.
      if provider='email' or exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method where method->>'method'='otp') then
        update public.users set onboarding_email_verified_at=coalesce(onboarding_email_verified_at,now()) where id=result.id returning * into result;
      end if;
      return result;
    end $$;

    create or replace function public.save_profile(given_name text,family_name text,company text default '',contact_phone text default '')
    returns public.users language plpgsql security definer set search_path = '' as $$
    declare result public.users;
    begin
      result := public.ensure_profile();
      if result.registration_provider='google' and result.onboarding_email_verified_at is null and not result.profile_complete then
        raise exception 'Verify the code or link sent to your email before continuing';
      end if;
      if length(trim(given_name)) not between 1 and 80 or length(trim(family_name))>80 or length(company)>160 or length(contact_phone)>40 then raise exception 'Check your personal details'; end if;
      update public.users set first_name=trim(given_name),last_name=trim(family_name),display_name=trim(trim(given_name)||' '||trim(family_name)),organization=trim(company),phone=trim(contact_phone),profile_complete=true,updated_at=now()
      where id=public.current_profile_id() returning * into result;
      return result;
    end $$;
    notify pgrst, 'reload schema';
    """)


def downgrade() -> None:
    raise RuntimeError(
        "Restore a backup to reverse onboarding state without losing verification history."
    )
