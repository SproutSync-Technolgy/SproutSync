# SproutSync

IoT-based mung bean sprout production, monitoring, and water-use optimization.

## Setup after cloning

Follow **[SETUP.md](SETUP.md)** for Windows, macOS, and Linux prerequisites,
Supabase configuration, Docker/native startup, validation, mobile/firmware tools,
and fixes for the reported container, proxy, migration, and environment errors.

The current application requires a matching Supabase Auth/PostgREST/database
project. Plain PostgreSQL alone cannot run the workspace migrations or browser
RPCs. Use a dedicated hosted development project or a full local Supabase stack.

After installing Node 22.12+ and Docker with Compose, create the root `.env` from
[.env.example](.env.example) and fill its five required values. Preserve an
existing configured `.env`. Then run from the repository root:

```sh
npm ci
npm run check:setup -- --docker
docker compose up --build --wait --wait-timeout 120 api
npm run dev
```

On PowerShell use `npm.cmd`. Windows users can run `start.bat` after filling
`.env`; it installs locked npm dependencies and waits for API startup.
Open http://localhost:5173 and http://localhost:8000/docs.

For native Python development, create a Python 3.12 virtual environment and run
`python -m pip install -r requirements.txt` using its interpreter at the repo
root. This installs the API, pytest, Ruff, and image utility dependency from
[pyproject.toml](backend/api/pyproject.toml). Follow SETUP.md to check the database,
apply migrations, and start Uvicorn. Optional ESP32 build dependencies are in
[requirements-firmware.txt](requirements-firmware.txt). npm and Flutter packages
use their own manifests; pip does not install system runtimes or those packages.

## Repository layout

```text
frontend/dashboard/          React, Vite, TypeScript, Tailwind dashboard
backend/api/                 FastAPI, SQLAlchemy, Alembic, API tests
mobile/                      Flutter Android/iOS/web client
supabase/templates/          Hosted Auth email templates
packages/contracts/          Shared integration specifications
database/                    Data model and migration guidance
infrastructure/mosquitto/    Optional local MQTT broker configuration
iot/esp32/                   PlatformIO serial-only firmware starter
scripts/                     Setup, validation, and build utilities
docs/                        Architecture, product, and release documentation
compose.yaml                 API and optional standalone infrastructure
requirements.txt             Native Python development install entry point
SETUP.md                     Setup instructions and troubleshooting
```

## Validation

```sh
npm run test:setup
npm run build
node scripts/verify-repository.mjs
```

Use the virtual environment interpreter for `python -m ruff check backend/api`
and `python -m pytest backend/api/tests -q`. See SETUP.md for browser, mobile,
firmware, and migration checks. API liveness does not prove database readiness
or email delivery.

The web/mobile workspace implements Supabase sign-in, profiles, role-based access,
and persisted operational records. Hardware telemetry ingestion, physical
irrigation, and production deployment remain separate work. Compilation does
not establish hardware safety. Local services bind to loopback by default.

Read [architecture](docs/architecture.md), [technology stack](docs/tech-stack.md),
[workspace release](docs/workspace-release.md), [testing](docs/testing.md),
[contribution rules](CONTRIBUTING.md), and [security](SECURITY.md).
Licensing remains a team decision; no open-source license is assumed.
