# Implementation Plan: Fix "Email Rate Limit Exceeded" & Multi-Attempt Verification via `.env` Google App Password

**Target Environment:** Google Antigravity IDE (Gemini 3.8) + AAS Skills MCP Server (`sickn33/agentic-awesome-skills`)  
**Project:** SproutSync (`egbocohxklbefxcewtlg` — FastAPI + SQLAlchemy/Alembic + React 19/Vite + Supabase Auth)

## 1. Root-Cause & Architecture Fix Using `.env` (`GOOGLE_APP_PASSWORD`)

Your repository `.env` already defines `GOOGLE_APP_PASSWORD` (16-character Google App Password with spaces) and `DATABASE_URL` / `SUPABASE_URL`. By routing onboarding email verification through FastAPI using `smtp.gmail.com:587` and your `.env` `GOOGLE_APP_PASSWORD` (and optionally entering the same credentials in Supabase Dashboard), you bypass Supabase's built-in **2 emails/hour** limit ([Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)) and gain full control over multi-attempt code verification:

| Issue Observed | Root Cause | Exact Fix in This Plan |
| :--- | :--- | :--- |
| **`429: email rate limit exceeded`** | Supabase's built-in SMTP server caps the entire project at **2 emails/hour** ([Supabase Custom SMTP Docs](https://supabase.com/docs/guides/auth/auth-smtp)). | Send onboarding OTP emails from FastAPI via `smtp.gmail.com:587` using `GOOGLE_APP_PASSWORD` from `.env` (and configure the same Gmail SMTP in Supabase Dashboard for initial sign-up emails). |
| **Google OAuth users stuck with `onboarding_email_verified_at = NULL`** | `public.users` has 3 `registration_provider = 'google'` rows with `NULL` verification timestamps, forcing Google users to request an email OTP. | Auto-set `onboarding_email_verified_at = now()` in `backend/api/app/auth.py` when `registration_provider == 'google'` (since Google OAuth already verified the address) and backfill existing `google` rows. |
| **Multiple code typos trigger new emails** | Retrying a wrong OTP code calls email resend instead of checking the code against the active token. | Track up to **5 verification attempts per issued 6-digit OTP** in `public.users` (`POST /api/v1/auth/verify/confirm`) without sending a new email, plus a **60-second resend cooldown**. |
| **`.env` formatting quirks** | Your `.env` has a UTF-8 BOM (`\ufeff`) on line 1 (`POSTGRES_DB`) and spaces inside `GOOGLE_APP_PASSWORD`. | Configure `SettingsConfigDict(env_file_encoding="utf-8-sig")` in `backend/api/app/config.py` and strip spaces (`google_app_password.replace(" ", "")`) automatically. |

## 2. Required `.env` Addition (1 Line)

Your `.env` already has `GOOGLE_APP_PASSWORD` on line 9. Add your Gmail address on line 10 so FastAPI `smtplib` knows which Google account owns that App Password ([Google Workspace SMTP Guide](https://knowledge.workspace.google.com/admin/gmail/send-email-from-a-printer-scanner-or-app)):

```env
GOOGLE_SMTP_EMAIL=your-gmail-address@gmail.com
```

*(Note: Never commit `.env` to Git. To also lift Supabase's own `/auth/v1/signup` limit from 2/hr to 30/hr, paste `smtp.gmail.com`, port `587`, your `GOOGLE_SMTP_EMAIL`, and the 16-character `GOOGLE_APP_PASSWORD` without spaces into **Supabase Dashboard → Authentication → Emails → SMTP Settings**.)*

## 3. AAS Skills MCP Stack (`aas-stack.json`)

Create `aas-stack.json` in the repository root for [Google Antigravity](https://antigravity.google/docs/mcp/) and the [AAS Core MCP server](https://aaskills.tech/docs/skills-vs-mcp-tools/):

```json
{
  "schemaVersion": 1,
  "project": "sproutsync",
  "targets": ["gemini", "antigravity"],
  "skills": [
    "@concise-planning",
    "@plan-writing",
    "@auth-implementation-patterns",
    "@api-rate-limit-handler",
    "@code-showcase-react-ui-patterns",
    "@code-showcase-systematic-debugging",
    "@executing-plans"
  ]
}
```

## 4. Atomic Tasks (`@executing-plans` — 2 Batches of 3 Tasks)

### Batch 1: `.env` Gmail SMTP Config, Google OAuth Auto-Verify & Schema

- [ ] **Task 1: Wire `GOOGLE_APP_PASSWORD` & `GOOGLE_SMTP_EMAIL` in `backend/api/app/config.py`**
  - **Skill**: Load `aas://skills/auth-implementation-patterns` via AAS MCP `get_skill`.
  - **Action**:
    1. Set `env_file_encoding="utf-8-sig"` in `SettingsConfigDict` so the UTF-8 BOM in `.env` never corrupts the first key.
    2. Add fields to `Settings`:
       - `google_smtp_email: str = ""`
       - `google_app_password: str = ""`
       - `smtp_host: str = "smtp.gmail.com"`
       - `smtp_port: int = 587`
    3. Add a helper property `clean_google_app_password` that returns `self.google_app_password.replace(" ", "").strip()`.
  - **Verify**: Run `python -m compileall -q backend/api/app` and confirm `settings.clean_google_app_password` has length `16`.

- [ ] **Task 2: Sync `public.users` Fields & Auto-Verify Google OAuth Users (`backend/api/app/models.py` & `backend/api/app/auth.py`)**
  - **Skill**: Load `aas://skills/auth-implementation-patterns` via AAS MCP `get_skill`.
  - **Action**:
    1. Ensure `User` in `backend/api/app/models.py` includes `profile_complete: Mapped[bool]`, `registration_provider: Mapped[str]`, and `onboarding_email_verified_at: Mapped[datetime | None]`.
    2. In `backend/api/app/auth.py` (`get_current_user`), read `app_metadata.provider` from the Supabase `/auth/v1/user` response.
    3. When `provider == "google"` (or `user.registration_provider == "google"`) and `user.onboarding_email_verified_at is None`, set `user.onboarding_email_verified_at = datetime.now(timezone.utc)` automatically so Google OAuth users never trigger email OTPs.
    4. Backfill existing Google OAuth rows in `public.users`:
       ```sql
       UPDATE public.users
       SET onboarding_email_verified_at = COALESCE(onboarding_email_verified_at, NOW())
       WHERE registration_provider = 'google'
         AND onboarding_email_verified_at IS NULL;
       ```
  - **Verify**: Query `public.users` and confirm all `registration_provider = 'google'` rows have a non-null `onboarding_email_verified_at`.

- [ ] **Task 3: Add Multi-Attempt OTP & Cooldown Columns (`backend/api/migrations/versions/0003_verification_attempts.py`)**
  - **Skill**: Load `aas://skills/api-rate-limit-handler` via AAS MCP `get_skill`.
  - **Action**:
    1. Create Alembic migration `0003_verification_attempts.py` adding (with `IF NOT EXISTS` safety for existing Supabase columns):
       - `verification_code_hash: String(64) | None`
       - `verification_expires_at: DateTime(timezone=True) | None`
       - `verification_attempts: Integer (server_default="0", max 5)`
       - `verification_last_sent_at: DateTime(timezone=True) | None`
       - `verification_locked_until: DateTime(timezone=True) | None`
  - **Verify**: Run `alembic upgrade head` cleanly.

> **Checkpoint 1 (`@executing-plans`)**: Stop after Task 3, report verification output, and wait for architect review before Batch 2.

### Batch 2: Gmail SMTP Sender, Multi-Attempt Verify API & Frontend UI

- [ ] **Task 4: Implement Gmail SMTP Sender & Multi-Attempt Verify Endpoints (`backend/api/app/main.py`)**
  - **Skill**: Load `aas://skills/api-rate-limit-handler` and `aas://skills/auth-implementation-patterns`.
  - **Action**:
    1. Create an SMTP dispatch helper using `smtplib.SMTP(settings.smtp_host, settings.smtp_port)` with `starttls()` and `login(settings.google_smtp_email, settings.clean_google_app_password)` to send a 6-digit verification code.
    2. Add `POST /api/v1/auth/verify/send`:
       - Return `{"status": "already_verified"}` immediately if `user.onboarding_email_verified_at` is not `None`.
       - Enforce a **60-second cooldown** using `verification_last_sent_at` (returning `{"status": "cooldown_active", "retry_after_seconds": remaining}` without re-sending).
       - Generate a 6-digit OTP, store its SHA-256 hash in `verification_code_hash`, reset `verification_attempts = 0`, set `verification_expires_at = now + 10 min`, and send via Google SMTP.
    3. Add `POST /api/v1/auth/verify/confirm`:
       - Allow up to **5 attempts** against `verification_code_hash` before locking (`verification_locked_until = now + 60s`).
       - On wrong code: increment `verification_attempts`, **do not send a new email**, and return `400` with `attempts_remaining = 5 - verification_attempts`.
       - On match: set `onboarding_email_verified_at = now()`, reset attempts/hash, and return the updated user profile.
  - **Verify**: Run `pytest backend/api/tests` to confirm 4 wrong code attempts decrement `attempts_remaining` without sending extra emails and the 5th correct code verifies the user.

- [ ] **Task 5: Enhance Frontend Verification UI for Multiple Attempts & Cooldowns (`frontend/dashboard/src/supabase.ts` & `frontend/dashboard/src/App.tsx`)**
  - **Skill**: Load `aas://skills/code-showcase-react-ui-patterns` and `aas://skills/api-rate-limit-handler`.
  - **Action**:
    1. Add a single-flight ref guard so React 19 `StrictMode` never fires duplicate `/api/v1/auth/verify/send` requests on mount.
    2. Persist the 60-second resend timer in `sessionStorage` (`sproutsync_otp_cooldown_until:<email>`).
    3. Keep the 6-digit OTP input box active across failed verification attempts (showing `Attempts remaining: X of 5`) and during `429` rate-limit cooldowns so the user can always enter the latest code in their inbox.
  - **Verify**: Run `npm.cmd run typecheck` and `npm.cmd run build` with zero errors.

- [ ] **Task 6: Run Full Validation & Update Compliance Docs**
  - **Skill**: Load `aas://skills/code-showcase-systematic-debugging`.
  - **Action**:
    1. Execute `node scripts/verify-repository.mjs`, `npm.cmd run typecheck`, `npm.cmd run build`, and `pytest`.
    2. Update `docs/current-status.md` and `PR-COMPLIANCE-TRACKER.md`.
  - **Verify**: All validation commands exit with code `0`.

## 5. Short Prompt for Gemini 3.8 Antigravity

```text
Use @executing-plans with the AAS Skills MCP server (`get_skill` for `@auth-implementation-patterns`, `@api-rate-limit-handler`, `@code-showcase-react-ui-patterns`, `@executing-plans`) to execute `email-rate-limit-verification-plan.md` in 2 batches of 3 tasks:
1. Read `GOOGLE_APP_PASSWORD` (stripping spaces and handling UTF-8 BOM) and `GOOGLE_SMTP_EMAIL` from `.env` in `backend/api/app/config.py`.
2. Auto-set `onboarding_email_verified_at = now()` for `registration_provider == 'google'` in `backend/api/app/auth.py` and backfill existing Google rows in `public.users`.
3. Add `/api/v1/auth/verify/send` (60s cooldown via `smtp.gmail.com:587`) and `/api/v1/auth/verify/confirm` (up to 5 code attempts per OTP without resending emails), then update the React verification UI to handle multiple attempts and `429` cooldowns gracefully. Pause after Task 3 for review.
```