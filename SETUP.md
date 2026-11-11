# SproutSync setup

Run commands in the repository folder. Windows commands use **PowerShell**;
Linux commands use **Bash**.

## Already set up? Just run

```powershell
.\start.bat
```

Open **http://localhost:5173**. Run **`.\stop.bat`** in another terminal to stop
the local API and dashboard, or press **Ctrl+C** in the launch terminal.
Running **`.\start.bat`** again recognizes a healthy session from this checkout,
prints the local URL, and exits successfully without installing or restarting
anything. After editing backend `.env` settings, run **`.\stop.bat`** and then
**`.\start.bat`** to load them.

Run **`.\verify.bat`** to list required libraries, installed versions, missing
packages, and configuration problems. Verification installs nothing and starts
no services. Use **`.\verify.bat -Online`** to also check database connectivity.

The API saves ordinary sensor history every 60 seconds by default while keeping
the latest live packet available to the dashboard. Fault and recovery changes
save immediately. Set `TELEMETRY_SAMPLE_SECONDS` in `.env` to change the interval
(1–3600 seconds), then restart. Existing history is retained. See
[telemetry, notifications and usability](docs/telemetry-and-usability.md) for
storage limits, quality checks and the proposed retention policy.

## Linux quick start

Install Node.js 22.12+ with npm, Python 3.12+ with its venv/pip support, and
`flock` from util-linux. Use a fresh Linux checkout and configure the same five
Supabase/database values described below. Keep your existing `.env`.

```bash
chmod +x start.sh stop.sh verify.sh  # Needed if the extracted ZIP lost permissions
./start.sh
```

Open **http://localhost:5173**. First startup creates `backend/api/.venv` and
installs missing packages. Later starts reuse complete installations, repair
damaged Python packages, and recognize a healthy running session. Startup checks
the database and applies pending migrations, just like the Windows launcher.

```bash
./stop.sh                 # Stop this checkout's tracked local services
./verify.sh               # Read-only installed/missing library inventory
./verify.sh --online      # Also check database connectivity
./start.sh --check        # Same read-only check as verify.sh
./start.sh --install-only # Prepare packages without database changes or services
```

The `.sh` launchers use the native Python backend and require Linux Bash and
`/proc`. They can be invoked as `bash start.sh`, `bash stop.sh`, and
`bash verify.sh` if executable permissions are unavailable. Their session record
is `.tools/dev-session.pid`; Windows uses `.tools/dev-session.json`. Avoid copying
Windows `node_modules`, `.venv`, or `.tools` into Linux. Restart with `./stop.sh`
and `./start.sh` after changing backend settings. For macOS or Docker use the
[advanced setup reference](docs/setup-reference.md).

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

- **Port already in use:** a healthy session from this checkout is reused. For
  an incomplete session, run `.\stop.bat` and retry. If another app or checkout
  owns the port, stop it in its own terminal; this checkout's stop command does
  not stop unrelated processes. Stop older launcher versions with Ctrl+C in
  their original terminal.
- **Missing configuration:** fill the five `.env` values above and restart.
- **API error:** read `.tools/dev-api.stderr.log`.
- **Dashboard error:** read `.tools/dev-dashboard.stderr.log`.
- **Editor import warnings:** select `backend/api/.venv` using VS Code's
  **Python: Select Interpreter**, then reload the window.

For **Docker, macOS/Linux, Google sign-in, tests, mobile, ESP32, or detailed
troubleshooting**, use the [advanced setup reference](docs/setup-reference.md).

For live ESP32 detection and sensor readings, see [MQTT device setup](docs/mqtt-device-setup.md).
For adding an ESP32 over the local Wi-Fi network or Bluetooth, see
[device discovery and firmware integration](docs/device-discovery.md).
