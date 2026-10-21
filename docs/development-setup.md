# Development setup and implementation status

This document is the source of truth for starting local development and for
distinguishing working code from planned integrations.

## Required tools

| Tool | Version | Why it is needed |
| --- | --- | --- |
| Node.js | `22.12+` | Dashboard build and Vite development server |
| npm | Bundled with Node.js | Workspace dependency installation and scripts |
| Python | `3.12+` | FastAPI service and API tests when Docker is not used |
| Docker Desktop | Current Compose-supporting release | Local PostgreSQL, Mosquitto, and API container |
| PlatformIO Core | `6.1.18+` | ESP32 firmware compilation |
| Flutter | Stable channel | Future Android/iOS mobile client |
| Android Studio/Xcode | Current supported release | Mobile SDK and emulator/device tooling |

The current repository does not require an additional frontend library for the
landing slice. React, Vite, TypeScript, Tailwind CSS, and Recharts are already
declared in the workspace. Recharts is reserved for the planned telemetry and
water-use screens.

Flutter is scaffolded under `mobile/` but is not required for the current web
workflow. Install Flutter later, then run `flutter pub get` and `flutter run`
from that directory. Run `flutter create .` there to generate platform host
folders once Android or iOS development begins.

## Windows setup

From `C:\Users\kiraz\Downloads\SPROUTSYNC`:

```powershell
Copy-Item .env.example .env
npm.cmd ci
docker compose up --build -d
npm.cmd run dev
```

The API container applies the Alembic migrations automatically before it
starts. To use the created Supabase project instead of the local PostgreSQL
container, replace `DATABASE_URL` in `.env` with the PostgreSQL connection
string from Supabase **Connect → ORMs → SQLAlchemy**. Use the pooler
connection for local development when Supabase recommends it, and URL-encode
special characters in the database password.

Google sign-in requires a Google Cloud OAuth 2.0 Web client. Add the client ID
and secret to `.env` and register this redirect URI:

```text
http://localhost:8000/api/v1/auth/google/callback
```

Restart the API after changing `.env`. Credentials are read only from the
environment and must never be committed.

Open `http://localhost:5173`. The dashboard proxies `/api` requests to
`http://127.0.0.1:8000`; the API documentation is at
`http://localhost:8000/docs`.

If Docker is unavailable, run the API directly:

```powershell
py -3.12 -m venv backend\api\.venv
backend\api\.venv\Scripts\python.exe -m pip install -e ".\backend\api[dev]"
backend\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend\api --reload --host 127.0.0.1
```

## Validation commands

```powershell
npm.cmd run typecheck
npm.cmd run build
node scripts\verify-repository.mjs
Push-Location backend\api
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m pytest
Pop-Location
pio run --project-dir iot\esp32
```

The firmware command compiles only. Do not connect pumps or valves until the
board variant, GPIO mapping, relay polarity, sensor limits, and emergency
interlocks have been reviewed against the actual hardware.

## Current code boundaries

- **Dashboard:** public responsive landing experience, prototype onboarding
  dialogs, mobile-app notice, and backend health indicator are implemented.
- **API:** process liveness only (`GET /api/v1/health`); it does not yet persist
  users, batches, telemetry, irrigation events, or alerts.
- **Database and MQTT:** provisioned by Compose but not consumed by the API.
- **Firmware:** serial-only starter; no GPIO, sensors, pumps, valves, or SD
  queue are implemented.

The next development libraries should be added only when their vertical slice
is approved: SQLAlchemy/Alembic or an equivalent migration stack for
persistence, a validated MQTT client for ingestion, and an authentication
library with secure session/token handling. No credentials or production
certificates belong in this repository.
