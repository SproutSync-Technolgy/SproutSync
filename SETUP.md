# SproutSync setup

Run commands in the repository folder using **PowerShell**.

## Already set up? Just run

```powershell
.\start.bat
```

Open **http://localhost:5173**. Run **`.\stop.bat`** in another terminal to stop
the local API and dashboard, or press **Ctrl+C** in the launch terminal.

Run **`.\verify.bat`** to list required libraries, installed versions, missing
packages, and configuration problems. Verification installs nothing and starts
no services. Use **`.\verify.bat -Online`** to also check database connectivity.

## First time on a Windows computer

### 1. Install the tools

Install [Git](https://git-scm.com/downloads), [Node.js 22.12+](https://nodejs.org/),
and [Python 3.12+](https://www.python.org/downloads/). Reopen your terminal.
This setup uses hosted Supabase and does not need Docker.

### 2. Get the repo and configure `.env`

Skip the clone commands if you already have the repo:

```powershell
git clone https://github.com/SproutSync-Technolgy/SproutSync.git
cd SproutSync
```

Create `.env` if it is missing:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Fill these five values in `.env` using your team's development Supabase project:

| Setting | Value to enter |
| --- | --- |
| `DATABASE_URL` | The project's database connection URL, starting with `postgresql+psycopg://` |
| `SUPABASE_URL` | The project API URL |
| `SUPABASE_ANON_KEY` | The public anon/publishable client key |
| `VITE_SUPABASE_URL` | Same value as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same value as `SUPABASE_ANON_KEY` |

Use one project for all five values. Keep an existing working `.env` and never
commit it. Only public client keys belong in the `VITE_` settings.

### 3. Start

Run this on the first and every later start:

```powershell
.\start.bat
```

On the first run, the launcher installs the locked JavaScript packages, creates
`backend/api/.venv`, and installs the Python requirements. Later starts inspect
the installed versions and **skip installation when everything is ready**. Missing,
outdated, or damaged packages trigger installation/repair when needed, including
after pulling dependency changes. An outdated manifest/lockfile pair is reported
with instructions to update the lockfile.

Once `.env` is configured, startup checks the database, applies pending migrations,
and runs the native API and dashboard. Use your team's development database;
coordinate migrations if it is shared. If `.env` is missing, startup creates a
template and asks you to fill it before running services; installed packages are
reused on the next attempt. Node.js and Python themselves must already be installed.

For packages only, without checking the database or starting services, run
**`.\start.bat -InstallOnly`**. Docker remains available explicitly through
**`.\start.bat -Backend Docker`**; normal `.\start.bat` uses native Python.

## If something fails

- **Port already in use:** run `.\stop.bat`; stop sessions from older launcher
  versions with Ctrl+C in their original terminal.
- **Missing configuration:** fill the five `.env` values above and restart.
- **API error:** read `.tools/dev-api.stderr.log`.
- **Dashboard error:** read `.tools/dev-dashboard.stderr.log`.
- **Editor import warnings:** select `backend/api/.venv` using VS Code's
  **Python: Select Interpreter**, then reload the window.

For **Docker, macOS/Linux, Google sign-in, tests, mobile, ESP32, or detailed
troubleshooting**, use the [advanced setup reference](docs/setup-reference.md).

For live ESP32 detection and sensor readings, see [MQTT device setup](docs/mqtt-device-setup.md).
