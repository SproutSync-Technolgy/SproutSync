"""Serialize first-login profile creation for simultaneous web/mobile sessions."""

from alembic import op

revision = "0005_profile_race"
down_revision = "0004_workspace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    create or replace function public.ensure_profile() returns public.users
    language plpgsql security definer set search_path = '' as $$
    declare account auth.users; result public.users;
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
          insert into public.users (google_subject,email,display_name,role,is_active)
          values(account.id::text,lower(account.email),'','evaluator',true) returning * into result;
        end if;
      end if;
      if not result.is_active then raise exception 'Your account is inactive'; end if;
      return result;
    end $$;
    """)


def downgrade() -> None:
    pass
