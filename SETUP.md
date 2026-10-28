# Set up SproutSync after cloning

Run commands from the repository root unless a step says otherwise. These
instructions cover Windows, macOS, and Linux development computers. A phone
runs the Flutter app or accesses a deployed website; it does not run this
development stack. Hardware, operating-system support, and network access still
depend on the tools below.

## 1. Install system tools

| Tool | Version | When required |
| --- | --- | --- |
| Git | Supported release | Cloning/updating source |
| Node.js and npm | Node 22.12+; use Node 22 LTS for parity with CI | Web dashboard and environment checker |
| Docker Desktop or Docker Engine | Linux containers; Compose v2.20+ | Container API; also a full local Supabase stack |
| Python | 3.12+; use 3.12 for parity with Docker/CI | Native API, Python tests, utility scripts |
| Supabase project | Development project you can administer | Auth, database, RPCs, and PostgREST for the current application |
| Flutter / platform SDKs | Current compatible stable Flutter; run `flutter doctor` | Optional mobile work |
| PlatformIO | 6.1.18 | Optional ESP32 compilation |

Install from [Git](https://git-scm.com/downloads), [Node](https://nodejs.org/),
[Python](https://www.python.org/downloads/), and
[Docker](https://docs.docker.com/get-started/get-docker/). On Windows use Linux
containers and the supported WSL 2 setup. On Linux install the Compose plugin
along with Docker Engine. Open a new terminal after installation.

`requirements.txt` installs the Python API, test/lint tools, and Pillow used by
the image utility. It delegates to `backend/api/pyproject.toml`, so dependency
lists cannot drift apart. It cannot install Node, Docker, Flutter, Android/iOS
SDKs, npm packages, or operating-system drivers. `npm ci` installs the locked
JavaScript packages. `flutter pub get` installs mobile packages.
Python dependencies currently have bounded versions rather than a complete
transitive lock; use the documented Python version and CI checks when updating.
Do not copy `node_modules`, `.venv`, `.tools`, build output, or mobile SDK paths
between machines. Recreate them on each computer.

```text
git clone https://github.com/SproutSync-Technolgy/SproutSync.git
cd SproutSync
node --version
npm --version
docker compose version
docker info
```

On PowerShell use `npm.cmd` if `npm.ps1` is blocked. There is no need to change
the system execution policy.

## 2. Configure one Supabase development project

The current web and mobile apps call Supabase Auth and PostgREST/RPCs directly.
FastAPI verifies the same Auth sessions and connects to the **same database**.
Migrations require `auth.users`, `auth.uid()`, `auth.jwt()`, and the Supabase
database roles. A plain PostgreSQL container does not provide these. MQTT is
optional infrastructure; the current API does not consume it.

For the simplest setup, use a hosted development Supabase project. Ask the
project administrator for access/configuration, or create your own development
project. In Supabase, obtain:

1. The project API URL and **public anon or publishable client key**.
2. A PostgreSQL connection URL from **Connect**. Use a direct connection or
   **session pooler** reachable from your network. For SQLAlchemy use the
   `postgresql+psycopg://` prefix, URL-encode special characters in the password,
   and require SSL for hosted connections. Avoid transaction pooling for Alembic.

The URL, key, and database connection must refer to one project. Never combine a
hosted project's browser URL with a separate local database. Network-restricted
or IPv4-only computers may need Supabase's session-pooler connection.

Create `.env` once. Do not overwrite an existing configured file:

```powershell
# Windows PowerShell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

```sh
# macOS / Linux
test -f .env || cp .env.example .env
```

Edit the root `.env` and fill these five required values. The example below
contains placeholders; obtain the actual values from your development project:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres:URL_ENCODED_PASSWORD@YOUR_DB_HOST:5432/postgres?sslmode=require
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_CLIENT_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_CLIENT_KEY
FRONTEND_URL=http://localhost:5173
```

Copy the actual connection host, username, and port from Supabase Connect;
pooler usernames often include the project reference. Do not blindly copy the
sample username above. Define each variable once and use literal values rather
than `${...}` substitutions. Single-quote values containing `$` or `#` so dotenv
and Compose do not interpret them. Save as UTF-8. Keep `.env` out of Git.

| Variable | Required? | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLAlchemy/psycopg connection to the same Supabase database |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Yes | Server Auth URL and public client key |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Yes | Matching public browser configuration |
| `FRONTEND_URL` | Defaults to `http://localhost:5173` | Browser origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only admin email synchronization; leave blank if unused |
| `GOOGLE_SMTP_EMAIL`, `GOOGLE_APP_PASSWORD` | Optional pair | FastAPI verification email sender and Gmail app password |
| `SMTP_HOST`, `SMTP_PORT` | Optional | API SMTP connection; defaults to `smtp.gmail.com:587` |
| `DOCKER_DATABASE_URL`, `DOCKER_SUPABASE_URL` | Optional | Container-specific addresses for a full local Supabase stack |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Optional | Standalone experimental database profile only |

Never put a service-role/secret key, database password, or SMTP password in a
`VITE_` variable or mobile build. Browser values are bundled publicly.
Vite also loads `.env.local` and mode files, while the API reads only the root
`.env` plus its process environment. Remove stale overrides if they select a
different project. Restart Vite after changing `.env`; rebuild web bundles for
deployment and recreate API containers after server changes.

### Authentication administration

Enable the email provider and, if needed, Google in Supabase Auth. Put the Google
client ID/secret in Supabase provider settings. In Google Cloud use
`https://YOUR_PROJECT.supabase.co/auth/v1/callback` as the authorized callback.
Old `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and
`SESSION_COOKIE_SECURE` root variables are not used by this bearer-token flow.

Set the Supabase Site URL to `http://localhost:5173`. Allow the actual web callback
routes (`/dashboard`, `/operator`, `/superadmin`, `/reset-password`) under that
origin. Use `localhost` consistently instead of switching to `127.0.0.1` during
login. For native mobile, also allow `io.sproutsync.app://login-callback/`.
See [workspace release settings](docs/workspace-release.md) for email templates.
Supabase Auth email delivery has separate SMTP configuration in Supabase;
the API's Gmail variables do not configure hosted Auth emails.

### First administrator on a new project

After migrations, sign up with the intended administrator email, verify it,
and complete the profile. New accounts start pending; that is an access state,
not an installation failure. An existing Superadmin manages role/device grants.
An operator needs a granted device; an evaluator needs shared access before
operational records become available.

If this is a **new, team-owned development project with no administrator**, its
database owner can bootstrap one verified account in the Supabase SQL editor.
Replace the example email with the account you control. This is a deliberate
privileged database change; it is not part of dependency installation:

```sql
UPDATE public.users AS u
SET role = 'superadmin', updated_at = now()
FROM auth.users AS a
WHERE u.google_subject = a.id::text
  AND lower(a.email) = lower('YOUR_VERIFIED_ADMIN_EMAIL')
  AND a.email_confirmed_at IS NOT NULL
  AND u.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE role IN ('superadmin', 'admin') AND is_active
  )
RETURNING u.id, u.email, u.role;
```

Verify exactly the intended row, then sign out/in and open `/superadmin`.
If no row is returned, check the verified profile and whether an administrator
already exists; ask that administrator for access. Never enable client-side
role assignment or automatically promote whoever signs up first.

## 3. Start with Docker (recommended for the API)

No host Python installation is needed for this path.

```sh
npm ci
npm run check:setup -- --docker
docker compose up --build --wait --wait-timeout 120 api
npm run dev
```

On PowerShell substitute `npm.cmd` for `npm`. On Windows, `start.bat` performs
these steps and stops on installation, configuration, or API startup failures.
It creates a template `.env` if missing, then asks you to fill it before retrying.
It runs from any folder and uses a child-process-only PowerShell policy.

Compose builds the API from the current checkout, passes the server settings,
checks the Supabase database prerequisites, runs `alembic upgrade head`, and
waits for API health. First use downloads images and dependencies. If your
network is slow, increase `--wait-timeout`. **Migrations change the selected
database**; use a dedicated development project. For a shared project, coordinate
schema upgrades and back up records before upgrading. Do not run multiple
migration processes simultaneously.

Open the dashboard at **http://localhost:5173**, API docs at
**http://localhost:8000/docs**, and liveness at
**http://localhost:8000/api/v1/health**. Liveness reports the process; it does not
prove database/Auth/email availability. An unauthenticated `/api/v1/auth/me`
returns **401**, which is expected.

Stop Vite with Ctrl+C. Stop containers with `docker compose down`. Named data
volumes are preserved. Do not use `down -v` to troubleshoot a startup failure;
it deletes local database volumes.

Rebuild after pulling changes:

```sh
git pull
npm ci
npm run check:setup -- --docker
docker compose up --build --force-recreate --wait --wait-timeout 120 api
npm run dev
```

### Optional fully local Supabase

Use the [official local Supabase setup](https://supabase.com/docs/guides/local-development/cli/getting-started)
with Docker and the Supabase CLI. Run `supabase init` if this checkout has no
`supabase/config.toml`, then `supabase start` and `supabase status` from the repo
root. This launches the full Auth/PostgREST/database stack. The checked-in
`supabase/templates` folder contains email templates, not a running server.

Copy the local API URL, public client key, and DB URL from status into `.env`.
Change the DB URL prefix to `postgresql+psycopg://`. Keep the browser and native
server URLs at the reported host addresses. For the Docker API, set
`DOCKER_DATABASE_URL` and `DOCKER_SUPABASE_URL` to equivalent URLs using
`host.docker.internal` and the same reported ports/credentials. Compose includes
the host gateway mapping for Linux. The backend checks only database prerequisites;
also verify that the local Auth API is reachable from the container. Configure
local Auth redirects/providers using the CLI's `supabase/config.toml`.
Use Alembic from this repo for application migrations; there is no parallel
Supabase migration history to replay. Do not run a reset against data you need.

The optional standalone PostgreSQL and Mosquitto services are available with
`docker compose --profile infrastructure up -d postgres mqtt`. They are for
experiments and are **not a replacement for the full local Supabase stack**.

## 4. Native Python API instead of the API container

Use this path for API development or if you use hosted Supabase without Docker.
Do not run the API container and native API on port 8000 simultaneously.

Windows PowerShell:

```powershell
py -3.12 -m venv backend/api/.venv
backend/api/.venv/Scripts/python.exe -m pip install --upgrade pip
backend/api/.venv/Scripts/python.exe -m pip install -r requirements.txt
npm.cmd ci
npm.cmd run check:setup
backend/api/.venv/Scripts/python.exe -m app.check_setup
backend/api/.venv/Scripts/python.exe -m alembic -c backend/api/alembic.ini upgrade head
backend/api/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

macOS / Linux (ensure `python3` is Python 3.12+):

```sh
python3 -m venv backend/api/.venv
backend/api/.venv/bin/python -m pip install --upgrade pip
backend/api/.venv/bin/python -m pip install -r requirements.txt
npm ci
npm run check:setup
backend/api/.venv/bin/python -m app.check_setup
backend/api/.venv/bin/python -m alembic -c backend/api/alembic.ini upgrade head
backend/api/.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open a second terminal at the repo root and run `npm run dev` (`npm.cmd` on
PowerShell). Explicit Python paths avoid activation/execution-policy problems.
The editable install makes `app` importable from scripts regardless of the
terminal's working directory. Alembic's config resolves migrations relative to
itself. If `py` or `python` opens the Microsoft Store, install actual Python and
disable the conflicting Windows App Execution Alias or use its full path.
Never reuse an old virtual environment after moving/renaming the checkout.

## 5. Validate

```sh
npm run check:setup
npm run test:setup
npm run build
node scripts/verify-repository.mjs
```

For Python on Windows:

```powershell
backend/api/.venv/Scripts/python.exe -m pip check
backend/api/.venv/Scripts/python.exe -m ruff check backend/api
backend/api/.venv/Scripts/python.exe -m pytest backend/api/tests -q
backend/api/.venv/Scripts/python.exe -m alembic -c backend/api/alembic.ini current
backend/api/.venv/Scripts/python.exe -m alembic -c backend/api/alembic.ini heads
```

On macOS/Linux replace `.venv/Scripts/python.exe` with `.venv/bin/python`.
`current` should match `heads`; it connects read-only to the configured DB.
API tests use isolated SQLite fixtures and do not apply PostgreSQL migrations.
The liveness/startup tests do not write to your configured database.

For browser tests, install the required browser, then run:

```sh
# Linux/macOS: Chromium; Linux may also need Playwright's --with-deps option.
npx playwright install chromium
npm run test:browser -w @sproutsync/dashboard
npm run test:setup:browser
```

The Windows test config uses Microsoft Edge; install Edge or run
`npx playwright install msedge`. Browser tests mock Auth/REST and require the
public project variables; they do not prove real login/email delivery.
The separate setup smoke test starts an isolated server with blank public
configuration and an unreachable API. It checks the recovery message, favicon,
and JSON 503 responses without changing `.env` or starting real backend services.

### Optional mobile and ESP32 packages

For mobile, install Flutter and the Android SDK/JDK for Android, or macOS/Xcode
for iOS. Run `flutter doctor`, then `flutter pub get`, `flutter analyze`, and
`flutter test` from `mobile/`. Create the ignored `mobile/config.local.json`
with only `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then run
`flutter run --dart-define-from-file=config.local.json`.
See [mobile setup](mobile/README.md) for callback and APK build details.
The Android helper now uses Flutter on PATH or the optional local `.tools`
installation and respects configured Java/Android SDK locations.

For firmware, in a separate virtual environment install
`python -m pip install -r requirements-firmware.txt`, then run
`pio run --project-dir iot/esp32`. PlatformIO downloads its compiler/framework.
Compilation does not upload firmware or validate wiring or energized hardware.

## 6. Troubleshooting the reported errors

| Symptom | Cause and recovery |
| --- | --- |
| `Path(...).parents[3]` / `IndexError: 3` in `/app/app/config.py` | Old image assumed a deep checkout path. Current config searches for repository markers and falls back to `/app`. Rebuild the Compose API with `--build --force-recreate`; do not run a stale standalone image from Docker Desktop. |
| API exits before Uvicorn starts | Run `docker compose ps -a` and `docker compose logs --tail 100 api`. Fix the first startup/migration error. The prerequisite check now rejects non-Supabase databases before migrations. |
| `ECONNREFUSED 127.0.0.1:8000`, proxy 500/503 | Nothing is listening on port 8000, often because the API exited. Check API health directly and repair API startup. The proxy now reports unavailable API requests as JSON HTTP 503, including health requests. |
| Missing `VITE_SUPABASE_URL` / key | Fill the root `.env`, match server/public values, run `npm run check:setup`, restart Vite. The browser now shows a setup message instead of failing during module initialization. |
| `auth.users` / `auth.uid()` / `authenticated` missing | `DATABASE_URL` points to plain PostgreSQL. Use the matching hosted or full local Supabase DB. Do not create fake Auth tables or skip RLS migrations. |
| DB connection refused from Docker | Container `localhost` points to itself. For full local Supabase use the documented `DOCKER_*` overrides; for hosted use its actual DB host. |
| Wrong password / SSL / unreachable host | Check the project's Connect URL, password encoding, SSL, network/firewall, project availability, and direct vs session pooler connectivity. Never post the full URL in logs/issues. |
| `value too long for type character varying(32)` during revision stamping | Current migration environment creates a 64-character version column and widens an older narrow column transactionally. Pull/rebuild; existing revision IDs are preserved. |
| `/api/v1/auth/me` returns 401 | Expected without an access token. Sign in first. A 503 indicates unavailable/missing Auth settings; a 500 needs API logs and migration checks. |
| `/api/v1/health` succeeds but workspace fails | Health is process liveness. Confirm DB migration head, that browser/server use the same project, and Auth/RPC permissions. Missing tables/functions require migrations. |
| `favicon.ico` 404 | HTML now points to the tracked logo asset as the favicon. Hard-refresh an old cached page. |
| `broker.js` console message | There is no tracked `broker.js` in this repo. Check the console script's origin (including browser extensions); diagnose `/api` failures using the API logs and health checks above. |
| Port 5173 or 8000 already in use | Stop the older Vite/API process or container. Vite now fails on a busy 5173 instead of silently changing the OAuth origin. |
| `npm ci` gives Windows `EPERM` on a native `.node` file | Stop Vite, preview, and browser test servers before reinstalling. Then rerun `npm ci`; a running process may lock the native module. |
| Google opens wrong origin / email never arrives | Check Supabase redirect allowlist/provider and hosted SMTP settings. API Gmail settings only affect FastAPI OTP endpoints. |
| OTP endpoint returns 503 | Configure both Gmail fields and restart/recreate the API. Missing or failing SMTP no longer reports a false sent result or starts a resend cooldown. Supabase Auth SMTP is separate. |
| `.env` has duplicate/mismatched values | Run the checker; remove duplicate assignments and stale `.env.local`/mode/shell overrides. Do not replace working secrets with template blanks. |
| Migrations say table already exists but no matching revision | Use a clean development Supabase project or investigate its actual schema/history with the team. Do not blindly stamp head, drop tables, or delete volumes. |

Useful safe diagnostics:

```sh
docker compose config --quiet
docker compose ps -a
docker compose logs --tail 100 api
curl http://localhost:8000/api/v1/health
curl http://localhost:5173/api/v1/health
```

On PowerShell use `curl.exe`. Avoid sharing `docker compose config` without
`--quiet` or container inspection output: resolved environment values may contain
secrets. No setup command can generate your project's credentials or configure
its hosted Auth providers without project administration access.

References: [Compose container environment](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/),
[Vite environment files](https://vite.dev/guide/env-and-mode),
[Supabase local stack](https://supabase.com/docs/guides/local-development), and
[Alembic version-table hook](https://alembic.sqlalchemy.org/en/latest/api/ddl.html#alembic.ddl.impl.DefaultImpl.version_table_impl).
