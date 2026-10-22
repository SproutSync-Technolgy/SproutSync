# Current Development Status

Updated: 2026-10-22

## Repository handoff summary

SproutSync is an IoT mung bean sprout production platform. The repository is
organized by delivery boundary:

- `frontend/` contains the React/Vite web application.
- `backend/` contains the FastAPI, SQLAlchemy, and Alembic API.
- `iot/` is reserved for ESP32 firmware and device integration.
- `mobile/` contains the future Flutter scaffold.
- `database/`, `infrastructure/`, and `docs/` contain shared delivery assets.

The current active development target is the web software slice. Hardware and
mobile features are not represented as complete by the current UI.

## Completed in the current slice

- Root URL (`/`) is the grower entry point.
- Landing-page sign-in, sign-up, and get-started actions are grower actions.
- `/admin` remains the separate administrative entry point.
- The legacy `/grower` route redirects to `/`.
- Google OAuth uses the configured localhost callback and validates the
  short-lived state cookie.
- OAuth destination state returns growers to `/` and administrators to
  `/admin`.
- Successful OAuth creates or updates the user in Supabase PostgreSQL and
  creates a server-side session.
- The backend redirects successful login to the frontend rather than the API
  root.
- Supabase pooler connectivity and migrations `0001_identity` and
  `0002_batches` have been verified.
- The dashboard visual system was refined for alignment: shared icon boxes,
  button heights, card grids, panel headers, and responsive breakpoints.
- Loading, empty, unavailable, preview, and error states remain explicit.

## Validation evidence

The following checks passed for this slice:

```text
npm.cmd run typecheck
npm.cmd run build
python -m compileall -q backend\api\app
git diff --check
```

The live checks also passed:

- `GET /api/v1/health` returned HTTP 200.
- Google OAuth consent completed successfully.
- OAuth callback exchanged the authorization code.
- The authenticated user/session was persisted in Supabase.
- The browser returned to the frontend after login.
- `/` and `/admin` rendered as separate entry points.

## Known boundaries

This slice does not close the full software issues. Preview dashboard data,
admin role authorization, complete batch history, watering, telemetry,
conditions, alerts, exports, automated API tests, CI, deployment, and Flutter
features remain incomplete.

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
   ignored repository-root `.env`.
3. Use `localhost` consistently for local Google OAuth testing:
   `http://localhost:5173` and
   `http://localhost:8000/api/v1/auth/google/callback`.
4. Treat preview data as preview data until the corresponding API and tests
   are complete.
5. Before closing an issue, update the relevant documentation and include
   exact validation results in the pull request.
