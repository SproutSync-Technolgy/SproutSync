"""Prefill new Google profiles from the verified provider metadata."""

from alembic import op

revision = "0007_google_profile_details"
down_revision = "0006_alert_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    create or replace function public.ensure_profile() returns public.users
    language plpgsql security definer set search_path = '' as $$
    declare
      account auth.users;
      result public.users;
      given_name text;
      family_name text;
      display_name_value text;
    begin
      select * into account from auth.users where id = auth.uid();
      if account.id is null or account.email_confirmed_at is null then
        raise exception 'Verify your email before continuing';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(account.email), 0));
      select * into result from public.users where google_subject = account.id::text;
      if result.id is null then
        select * into result from public.users where lower(email) = lower(account.email);
        if result.id is not null then
          update public.users set google_subject = account.id::text where id = result.id returning * into result;
        else
          given_name := coalesce(
            nullif(account.raw_user_meta_data ->> 'given_name', ''),
            nullif(account.raw_user_meta_data ->> 'first_name', '')
          );
          family_name := coalesce(
            nullif(account.raw_user_meta_data ->> 'family_name', ''),
            nullif(account.raw_user_meta_data ->> 'last_name', '')
          );
          display_name_value := coalesce(
            nullif(account.raw_user_meta_data ->> 'full_name', ''),
            nullif(account.raw_user_meta_data ->> 'name', ''),
            trim(coalesce(given_name, '') || ' ' || coalesce(family_name, ''))
          );
          insert into public.users (
            google_subject, email, display_name, first_name, last_name, role, is_active
          ) values (
            account.id::text, lower(account.email), display_name_value,
            coalesce(given_name, ''), coalesce(family_name, ''), 'evaluator', true
          ) returning * into result;
        end if;
      end if;
      if not result.is_active then raise exception 'Your account is inactive'; end if;
      return result;
    end $$;
    """)


def downgrade() -> None:
    pass
