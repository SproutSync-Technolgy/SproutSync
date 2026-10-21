# SproutSync

IoT-based automated mung bean sprout production, plant life-cycle monitoring, and water-use optimization.

Development monorepo based on the supplied Software Development Plan dated August 26, 2026. The reference image informed the folder organization; the SDP defines the technology stack.

## Repository layout

```text
SPROUTSYNC/
??? apps/dashboard/             React + Vite + TypeScript + Tailwind
??? services/backend/api/       Python + FastAPI
??? firmware/esp32/             PlatformIO + Arduino + C++
??? packages/contracts/         Shared integration specifications
??? database/                   Data model and migration conventions
??? infrastructure/mosquitto/   Local MQTT configuration
??? docs/                       Architecture, backlog, testing, team
??? scripts/                    Repository verification
??? .github/                    CI, issue and PR templates
??? compose.yaml                Local API, PostgreSQL and Mosquitto
??? CONTRIBUTING.md
??? SECURITY.md
??? REPOSITORY-STANDARDS-CHECKLIST.md
??? PR-COMPLIANCE-TRACKER.md
```

## Quick start (PowerShell)

Install Node.js 22.12+ and Docker Desktop with Compose. Copy the environment template:

```powershell
Copy-Item .env.example .env
npm.cmd ci
docker compose up --build -d
npm.cmd run dev
```

Open http://localhost:5173 and the API documentation at http://localhost:8000/docs. The dashboard proxies /api to the local backend. Docker services bind only to loopback. Stop services with `docker compose down`; database data persists in a named volume.

### Backend without Docker

Install Python 3.12+; from the repository root:

```powershell
py -3.12 -m venv services/backend/api/.venv
services/backend/api/.venv/Scripts/python.exe -m pip install -e "./services/backend/api[dev]"
services/backend/api/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir services/backend/api --reload --host 127.0.0.1
```

### Validation

```powershell
npm.cmd run build
node scripts/verify-repository.mjs
Push-Location services/backend/api
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m pytest
Pop-Location
pio run --project-dir firmware/esp32
```

Install PlatformIO Core 6.1.18 for the last command. Compilation does not upload firmware. Verify actual board and pin mapping before implementing hardware outputs.

## Implementation status

Implemented: responsive dashboard landing slice aligned to the reference prototype, working sign-in/sign-up and mobile-app prototype actions, API connection status, typed health endpoint and contract test, local infrastructure configuration, serial-only firmware starter, and GitHub CI configuration.

Implemented foundation: Google OAuth configuration, PostgreSQL users/sessions
schema, Alembic migration, server-side HTTP-only sessions, and authenticated
identity endpoints. Planned next: device/batch persistence, telemetry
ingestion, WebSockets, production batches/trays, irrigation
scheduling/interlocks, MicroSD event replay, alerts, yield, analytics and
reports. API health is process liveness only. MQTT is provisioned but not yet
used by the API. No sensors or actuators are connected by this starter.

Prototype: https://sproutsync-prototype.figma.site/ . The current dashboard implements the public landing-page content and responsive layout from this reference. Product authentication, mobile distribution, device data, and production imagery remain future slices.

## Start development

Read [architecture](docs/architecture.md), [MVP scope](docs/mvp.md), [planning structure](docs/planning-structure.md), [backlog](docs/backlog.md), [team](docs/team.md), [testing](docs/testing.md), and [contribution rules](CONTRIBUTING.md).

For a precise dependency and environment checklist, read [development setup](docs/development-setup.md) and the [technology stack](docs/tech-stack.md). They record what is installed, what is optional, and which planned features still require additional libraries or hardware decisions.

The repository is published at [SproutSync-Technolgy/SproutSync](https://github.com/SproutSync-Technolgy/SproutSync). Branch protection, collaborator access, licensing, and deployment secrets remain team setup tasks. See [GitHub setup](docs/github-setup.md).

Licensing remains a team decision; no open-source license is assumed.
