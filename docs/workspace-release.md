# Connected workspace release

This is a historical release record. Use [SETUP.md](../SETUP.md) for current
startup/configuration instructions and `alembic heads` for the required schema
revision. Later migrations changed role/grant and onboarding behavior; their
checked-in definitions are the source of truth.

## Database

The existing Supabase database was upgraded through `0009_database_demo` without
deleting users or production batches. Alembic remains the migration source of truth:

```powershell
cd backend/api
.venv/Scripts/python.exe -m alembic upgrade head
```

The migrations add verified-profile onboarding, evaluator access grants, devices,
trays, six condition readings, schedules, watering events, alerts, evidence,
evaluations, maintenance, activity and notification preferences. All exposed
tables have row-level policies. Clients cannot assign roles, impersonate another
operator, manufacture device readings, or edit operational records as evaluators.

The former prototype samples now reside in PostgreSQL: three batches, ten devices,
three trays, six sensor values, seven days of water usage (30.1 L), three alerts,
planned evidence checks, and maintenance history. They are marked `is_demo`.
Operators with empty workspaces receive owned copies; evaluators with no shared
records can review a dedicated sample workspace. No browser fallback fabricates
records. Sample evidence is pending and does not claim real tests were performed.

## Authentication

- Email/password signup: create account → inbox code/link → manual personal details
  → success → dashboard. Google is below the email form.
- New Google account: Google OAuth → additional inbox code/link → review prefilled
  name/photo/email → confirm or edit → success → dashboard.
- Existing completed accounts: sign in → dashboard.
- A signed Supabase OTP authentication claim is required before a new Google profile
  can be completed. User-editable metadata cannot bypass that database check.
- `/operator` requires an operator/admin account. `/admin` redirects to `/operator`.
  Evaluators use `/dashboard`; `/mobile` opens responsive web navigation.
- The avatar menu contains Profile, Settings, Help & FAQ, and Sign out.
  Profile/settings is absent from the left sidebar. Sign-out asks Yes/No.

### Hosted email settings requiring project administration

Email confirmation and Google are enabled in the configured project. To deliver
the requested numeric codes and links, apply these files under Supabase
**Authentication → Email Templates**:

| Template | File |
| --- | --- |
| Confirm signup | `supabase/templates/confirmation.html` |
| Magic Link (new Google inbox verification) | `supabase/templates/magic_link.html` |
| Reset password | `supabase/templates/recovery.html` |

The templates use `{{ .Token }}` for codes and `{{ .ConfirmationURL }}` for links.
Configure a production SMTP sender to deliver to arbitrary Gmail addresses;
Supabase's default sender restricts recipients and rates. Database credentials do
not grant access to hosted Auth templates or SMTP settings. These administrative
settings have not been changed by the migration or verified through real email
delivery in automated tests.

Allow the web origin's `/dashboard`, `/operator`, `/reset-password` and the mobile
callback `io.sproutsync.app://login-callback/` in Supabase's redirect allowlist.
The Google provider callback remains the project's Supabase Auth callback.

Official references:
https://supabase.com/docs/guides/auth/auth-email-templates
https://supabase.com/docs/guides/auth/auth-email-passwordless

## Mobile download and platform boundaries

`scripts/build_mobile.py` builds the native Android preview and writes its APK plus
checksum manifest to the web public download directory. The landing button opens
`/download?start=1`, where the browser starts the APK download and shows installation
instructions. `/download` also offers the responsive mobile web workspace.

The APK is a development-signed ARM64 preview. Production store signing and iOS
distribution require platform credentials. Hardware Wi-Fi provisioning, controller
telemetry ingestion, physical schedule execution, native push delivery and offline
telemetry caching are not simulated by this release.

The generated preview compiled successfully (36,010,228 bytes). Android's
`apksigner` verified its v2 signature with a development certificate. The APK and
its generated manifest are ignored by Git and included in the locally built web
distribution. Build them again before deploying from a clean source checkout.

## Verification

```powershell
npm.cmd run build
npm.cmd run test:browser -w @sproutsync/dashboard
backend/api/.venv/Scripts/python.exe -m pytest backend/api/tests -q
```

From `mobile`, run `flutter analyze` and `flutter test`. Browser tests cover both
signup paths, role routing, real record form interactions, the avatar menu,
sign-out, responsive layouts and the APK download event. They mock Auth/PostgREST;
they do not claim Gmail delivery has been tested.

The following scripts separately exercise the real Supabase database in rollback
transactions, leaving no synthetic accounts or test records behind:

```powershell
$env:PYTHONPATH='backend/api'
backend/api/.venv/Scripts/python.exe scripts/verify_workspace_rls.py
backend/api/.venv/Scripts/python.exe scripts/verify_google_onboarding.py
```

`validate_pending_migrations.py` validates unapplied migrations with rollback.
The earlier `validate_workspace_migration.py` is specifically a pre-0004 check.
