# Current Development Status

Updated: 2026-10-26

## Repository handoff summary

SproutSync is an IoT mung bean sprout production platform. The repository is
organized by delivery boundary:

- `frontend/` contains the React/Vite web application.
- `backend/` contains the FastAPI, SQLAlchemy, and Alembic API.
- `iot/` is reserved for ESP32 firmware and device integration.
- `mobile/` contains the native Flutter app and Android/iOS/web host projects.
- `database/`, `infrastructure/`, and `docs/` contain shared delivery assets.

The current active software slice is the connected web workspace, with a
responsive mobile web experience and a Flutter client sharing the
same Supabase project.

## Completed in the current slice

- Root URL (`/`) is the public grower/evaluator landing page.
- `/dashboard` is the evaluator workspace and `/operator` is the restricted
  operator workspace. `/admin` redirects to `/operator` for compatibility.
- Operator/admin sessions are redirected away from the evaluator workspace;
  evaluators cannot open operator controls.
- Google login is now initiated by Supabase Auth from the browser using the
  PKCE flow.
- FastAPI no longer exposes an OAuth callback or accepts Google client
  secrets. It verifies Supabase bearer tokens through the Supabase Auth API.
- Successful Supabase authentication is projected into the local `users` table
  for ownership and role checks.
- Verified-profile onboarding supports email/password signup, numeric email
  verification, personal details, and the dashboard redirect. Google accounts
  use the same personal-details gate.
- New Google accounts verify their inbox after OAuth and then confirm or edit
  personal details prefilled from Google metadata. Existing completed accounts
  go directly to the dashboard. Database functions enforce the new-account
  OTP requirement using signed Supabase authentication claims.
- The workspace reads batches, devices, telemetry, irrigation, alerts,
  evidence, evaluations, maintenance, access grants, and activity from
  Supabase tables with RLS policies. New schema is documented in
  `docs/workspace-release.md`.
- The previous demonstration values are now persisted in Supabase with
  `is_demo` labels: three batches, ten devices, three alerts, six conditions,
  weekly water history, planned evidence checks and maintenance. Operators
  with empty workspaces receive owned samples; evaluators can review a sample
  workspace until operational records are shared with them.
- Profile & settings is available from the avatar menu rather than the left
  navigation, leaving the navigation focused on production and evaluation
  tasks.
- The account menu provides profile/settings/help actions and a Yes/No sign-out
  confirmation. The landing footer intentionally contains no “System ready”
  status badge.
- The dashboard visual system was refined for alignment: shared icon boxes,
  button heights, card grids, panel headers, and responsive breakpoints.
- Loading, empty, unavailable, preview, and error states remain explicit.

## Validation evidence

The following checks passed for this slice:

```text
npm.cmd run build
npm.cmd run test:browser -w @sproutsync/dashboard
python -m compileall -q backend\api\app backend\api\tests
python -m pytest backend\api\tests\test_workspace_permissions.py
git diff --check
```

All commands above passed. The backend test run reports one upstream
Starlette/httpx deprecation warning; it does not fail the suite.

Historical manual OAuth checks recorded before this implementation (not repeated by the browser mocks):

- `GET /api/v1/health` returned HTTP 200.
- Google OAuth consent completed successfully.
- OAuth callback exchanged the authorization code.
- The authenticated user/session was persisted in Supabase.
- The browser returned to the frontend after login.
- `/` and `/admin` rendered as separate entry points.

## Known boundaries

Controller ingestion, physical irrigation/Wi-Fi provisioning, native push,
production store signing and deployment remain external integration work.
Hosted Supabase email templates, SMTP sender settings and callback allowlists
need project-administrator configuration as detailed in `workspace-release.md`.
The native Flutter app passes analysis and four widget tests. The Android
preview compiled successfully and its Android v2 signature is verified.
It is built by `scripts/build_mobile.py` and served through `/download`.

GitHub tracking remains:

- #19 project completion parent
- #20 software workstream
- #27 authentication and authorization
- #30 web application completion
- #32 software quality and release

These issues should only be closed after their documented acceptance criteria,
tests, review evidence, and focused pull requests are complete.

## Continuation instructions

1. Read this file together with `docs/product-requirements.md`,
   `docs/technical-requirements.md`, `docs/app-flow.md`,
   `docs/design-brief.md`, `docs/database-schema.md`, and
   `docs/implementation-plan.md`.
2. Never place credentials in source control. Runtime secrets belong in the
   ignored repository-root `.env`. The Supabase anon key may be used in the
   browser; service-role keys, Google secrets, and database passwords may not.
3. Configure Supabase redirects for `/`, `/dashboard`, `/operator`, and
   `/reset-password`; keep the Google provider callback at the Supabase Auth
   callback URL.
4. The configured database is migrated through `0009_database_demo`. Use
   `alembic upgrade head` on other environments. Validate pending changes with
   `scripts/validate_pending_migrations.py` and verify permissions using the
   rollback-only RLS and Google onboarding scripts.
5. Before closing an issue, update the relevant documentation and include
   exact validation results in the pull request.
