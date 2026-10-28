# SproutSync

IoT-based mung bean sprout production, monitoring, and water-use optimization.

## Quick start

Follow **[SETUP.md](SETUP.md)** for the three-step first-time setup.
Once your Python environment and `.env` are configured, start from one
PowerShell terminal:

```powershell
.\start.bat -Backend Native
```

Open **http://localhost:5173**. Press **Ctrl+C** to stop.
This Windows workflow uses hosted Supabase and does not require Docker.
For Docker, macOS/Linux, optional tools, and troubleshooting, see the
[advanced setup reference](docs/setup-reference.md).

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
