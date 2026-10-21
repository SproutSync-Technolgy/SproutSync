# SproutSync technology stack

This document lists the technologies used by SproutSync, what each one does,
and what must be installed before development can begin.

## System requirements

| Tool | Required version | Required for | Installation |
| --- | --- | --- | --- |
| Windows 10/11 | Current supported release | Local development environment | Windows Update |
| Node.js | `22.12+` | Dashboard, Vite, TypeScript, and workspace scripts | [nodejs.org](https://nodejs.org/) |
| npm | Bundled with Node.js | Installing JavaScript dependencies | Included with Node.js |
| Python | `3.12+` | FastAPI backend and API tests outside Docker | [python.org](https://www.python.org/downloads/) |
| Docker Desktop | Current Compose-supporting release | PostgreSQL, Mosquitto, and API containers | [docker.com](https://www.docker.com/products/docker-desktop/) |
| PlatformIO Core | `6.1.18+` | ESP32 firmware compilation and upload | VS Code PlatformIO extension or `pip` |
| Git | Current stable release | Source control and GitHub synchronization | [git-scm.com](https://git-scm.com/downloads) |

Install the VS Code extensions recommended by
[`.vscode/extensions.json`](../.vscode/extensions.json), especially:

- ESLint/TypeScript support for the dashboard
- Python and Pylance for the API
- PlatformIO IDE for ESP32 development
- Docker support for local services

## Application stack

### Dashboard

| Technology | Version/source | Purpose |
| --- | --- | --- |
| React | `19.x` | Component-based user interface |
| React DOM | `19.x` | Browser rendering |
| TypeScript | `5.9.x` | Static typing and safer refactoring |
| Vite | `7.x` | Development server and production bundling |
| Tailwind CSS | `4.x` | CSS utility foundation |
| Recharts | `3.x` | Planned telemetry, water-use, and yield charts |

Dashboard source is in [`frontend/dashboard/`](../frontend/dashboard/). Dependencies are
declared in [`frontend/dashboard/package.json`](../frontend/dashboard/package.json) and
installed from the repository root.

### Backend API

| Technology | Version/source | Purpose |
| --- | --- | --- |
| Python | `3.12+` | Backend runtime |
| FastAPI | `0.115+` | REST API framework and OpenAPI documentation |
| Uvicorn | `0.34+` | ASGI development and production server |
| Pydantic | FastAPI dependency | Request and response validation |
| SQLAlchemy | `2.x` | PostgreSQL ORM and database sessions |
| Alembic | `1.15+` | Versioned database migrations |
| psycopg | `3.x` | PostgreSQL driver |
| httpx | `0.28+` | Google OAuth code exchange and profile lookup |
| pydantic-settings | `2.x` | Environment-based configuration |
| pytest | `8.x` | API tests |
| httpx | `0.28+` | FastAPI test client transport |
| Ruff | `0.11+` | Python linting |

Backend source is in [`backend/api/`](../backend/api/).
Python dependencies are defined in
[`backend/api/pyproject.toml`](../backend/api/pyproject.toml).

### Firmware

| Technology | Version/source | Purpose |
| --- | --- | --- |
| ESP32 | Board selection still requires hardware confirmation | Device controller |
| C++ | Arduino framework | Sensor and actuator firmware |
| PlatformIO | `6.1.18+` | Build, upload, and board environment management |
| Arduino core for ESP32 | PlatformIO-managed | ESP32 runtime APIs |

Firmware source is in [`iot/esp32/`](../iot/esp32/). GPIO mappings,
relay polarity, sensor models, pump limits, and board variant must be confirmed
before hardware libraries or actuator code are added.

## Local infrastructure

| Service | Technology | Local address | Purpose |
| --- | --- | --- | --- |
| Database | PostgreSQL `17-alpine` | `127.0.0.1:5432` | Planned batch, device, telemetry, and audit persistence |
| Message broker | Eclipse Mosquitto `2` | `127.0.0.1:1883` | Planned device-to-backend MQTT communication |
| API container | Python/FastAPI | `127.0.0.1:8000` | Backend service |
| Dashboard | Vite | `127.0.0.1:5173` | Browser development server |

Compose configuration is in [`compose.yaml`](../compose.yaml). PostgreSQL and
Mosquitto are provisioned now, but the API does not yet consume either service.
The current MQTT configuration is for loopback development only; production
deployment requires TLS, credentials, and per-device ACLs.

### Google authentication

Google OAuth is configured through the backend, not the browser. The API
stores users and hashed server-side session tokens in PostgreSQL. Configure a
Google Cloud OAuth 2.0 Web application client with this authorized redirect
URI:

```text
http://localhost:8000/api/v1/auth/google/callback
```

Copy its client ID and secret into `.env` as `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. Never commit those values. The dashboard's
“Continue with Google” button opens `/api/v1/auth/google`; the callback creates
or updates the local user and redirects back with an HTTP-only session cookie.

## Setup

From the repository root:

```powershell
Copy-Item .env.example .env
npm.cmd ci
docker compose up --build -d
npm.cmd run dev
```

Open the dashboard at `http://localhost:5173` and API documentation at
`http://localhost:8000/docs`.

### Backend without Docker

```powershell
py -3.12 -m venv backend\api\.venv
backend\api\.venv\Scripts\python.exe -m pip install -e ".\backend\api[dev]"
backend\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend\api --reload --host 127.0.0.1
```

### Firmware build

```powershell
pio run --project-dir iot\esp32
```

This compiles the firmware only. Uploading or energizing hardware requires a
validated board, wiring diagram, GPIO map, calibration record, and safety review.

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

## Future libraries and integrations

These are intentionally not installed yet because their design depends on the
next approved vertical slices:

1. **Persistence:** SQLAlchemy plus Alembic, or an equivalent typed database
   and migration stack.
2. **MQTT ingestion:** A maintained Python MQTT client plus topic and payload
   schema validation.
3. **Authentication:** Secure session or token library, password hashing, and
   role-based authorization.
4. **Realtime dashboard:** WebSocket or Server-Sent Events support after the
   telemetry contract is finalized.
5. **Device safety:** Sensor and actuator libraries only after the exact ESP32
   board and electrical components are confirmed.
6. **Observability:** Structured logging, metrics, and health/readiness checks
   before production deployment.

Do not add cloud services, mobile frameworks, AI services, or hardware drivers
just to match a prototype screen. Add each dependency with its first tested
feature and document its security, offline, and recovery behavior.

## Current implementation boundary

Implemented:

- Responsive React dashboard landing page
- Prototype sign-in and sign-up dialogs
- Mobile-app placeholder action
- API health status indicator
- FastAPI health endpoint
- Docker Compose service definitions
- ESP32 serial starter
- TypeScript, Python, repository, and CI validation

Not implemented yet:

- User accounts and authentication
- PostgreSQL models and migrations
- MQTT telemetry ingestion
- Device registration and management
- Sensor readings and actuator control
- Irrigation scheduling and interlocks
- Offline MicroSD queue and replay
- Alerts, yield calculations, reports, and production dashboard screens
