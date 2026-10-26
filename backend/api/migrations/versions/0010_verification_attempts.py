"""Add multi-attempt OTP tracking, cooldown columns, and backfill Google verifications.

Revision ID: 0010_verification_attempts
Revises: 0009_database_demo
"""

from alembic import op

revision = "0010_verification_attempts"
down_revision = "0009_database_demo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_code_hash text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_last_sent_at timestamptz;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_locked_until timestamptz;

    -- Backfill existing Google OAuth rows in public.users
    UPDATE public.users
    SET onboarding_email_verified_at = COALESCE(onboarding_email_verified_at, NOW())
    WHERE registration_provider = 'google'
      AND onboarding_email_verified_at IS NULL;

    -- Update ensure_profile to auto-verify Google accounts
    CREATE OR REPLACE FUNCTION public.ensure_profile() RETURNS public.users
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
    DECLARE account auth.users; result public.users; provider text; given_name text; family_name text; full_name_value text;
    BEGIN
      SELECT * INTO account FROM auth.users WHERE id = auth.uid();
      IF account.id IS NULL OR account.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Verify your email before continuing'; END IF;
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(account.email),0));
      provider := CASE WHEN (account.raw_app_meta_data->'providers') ? 'google' THEN 'google' ELSE 'email' END;
      SELECT * INTO result FROM public.users WHERE google_subject = account.id::text;
      IF result.id IS NULL THEN
        SELECT * INTO result FROM public.users WHERE lower(email)=lower(account.email);
        IF result.id IS NOT NULL THEN
          UPDATE public.users SET google_subject=account.id::text WHERE id=result.id RETURNING * INTO result;
        ELSE
          INSERT INTO public.users(google_subject,email,display_name,role,is_active)
          VALUES(account.id::text,lower(account.email),'','evaluator',true) RETURNING * INTO result;
        END IF;
      END IF;
      IF NOT result.is_active THEN RAISE EXCEPTION 'Your account is inactive'; END IF;
      IF NOT result.profile_complete AND provider='google' THEN
        full_name_value := COALESCE(nullif(account.raw_user_meta_data->>'full_name',''),nullif(account.raw_user_meta_data->>'name',''),'');
        given_name := COALESCE(nullif(account.raw_user_meta_data->>'given_name',''),nullif(account.raw_user_meta_data->>'first_name',''),split_part(full_name_value,' ',1));
        family_name := COALESCE(nullif(account.raw_user_meta_data->>'family_name',''),nullif(account.raw_user_meta_data->>'last_name',''),nullif(trim(substr(full_name_value,length(given_name)+1)),''),'');
        UPDATE public.users SET registration_provider='google',
          first_name=CASE WHEN first_name='' THEN left(given_name,80) ELSE first_name END,
          last_name=CASE WHEN last_name='' THEN left(family_name,80) ELSE last_name END,
          display_name=CASE WHEN display_name='' THEN left(full_name_value,200) ELSE display_name END,
          avatar_url=COALESCE(avatar_url,account.raw_user_meta_data->>'avatar_url',account.raw_user_meta_data->>'picture'),
          onboarding_email_verified_at=COALESCE(onboarding_email_verified_at, NOW())
        WHERE id=result.id RETURNING * INTO result;
      END IF;
      IF provider='google' OR provider='email' OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) method WHERE method->>'method'='otp') THEN
        UPDATE public.users SET onboarding_email_verified_at=COALESCE(onboarding_email_verified_at, NOW()) WHERE id=result.id RETURNING * INTO result;
      END IF;
      RETURN result;
    END $$;

    -- Update save_profile so users are never blocked by unverified email checks
    CREATE OR REPLACE FUNCTION public.save_profile(given_name text, family_name text, company text DEFAULT '', contact_phone text DEFAULT '')
    RETURNS public.users LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
    DECLARE result public.users;
    BEGIN
      IF length(trim(given_name)) NOT BETWEEN 1 AND 80 OR length(trim(family_name))>80 OR length(company)>160 OR length(contact_phone)>40 THEN
        RAISE EXCEPTION 'Check your personal details';
      END IF;
      UPDATE public.users SET
        first_name=trim(given_name),
        last_name=trim(family_name),
        display_name=trim(trim(given_name)||' '||trim(family_name)),
        organization=trim(company),
        phone=trim(contact_phone),
        profile_complete=true,
        onboarding_email_verified_at=COALESCE(onboarding_email_verified_at, NOW()),
        updated_at=now()
      WHERE id=public.current_profile_id() RETURNING * INTO result;
      RETURN result;
    END $$;

    NOTIFY pgrst, 'reload schema';
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE public.users DROP COLUMN IF EXISTS verification_locked_until;
    ALTER TABLE public.users DROP COLUMN IF EXISTS verification_last_sent_at;
    ALTER TABLE public.users DROP COLUMN IF EXISTS verification_attempts;
    ALTER TABLE public.users DROP COLUMN IF EXISTS verification_expires_at;
    ALTER TABLE public.users DROP COLUMN IF EXISTS verification_code_hash;
    NOTIFY pgrst, 'reload schema';
    """)
