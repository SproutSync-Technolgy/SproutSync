# SproutSync setup

Run commands in the repository folder using **PowerShell**.

## Already set up? Just run

```powershell
.\start.bat -Backend Native
```

Open **http://localhost:5173**. Press **Ctrl+C** to stop.
Stop any older API/dashboard terminal before starting another session.

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

### 3. Install Python packages and start

Run these commands once:

```powershell
py -3 -m venv backend/api/.venv
.\backend\api\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\start.bat -Backend Native
```

The launcher installs the frontend packages, checks configuration, applies
pending database migrations, and starts the API and dashboard. Use your team's
development database; coordinate migrations if that database is shared.

After this, each normal start only needs **`.\start.bat -Backend Native`**.
After pulling changes to Python requirements, rerun the pip install command.

## If something fails

- **Port already in use:** stop the old API/dashboard terminal with Ctrl+C.
- **Missing configuration:** fill the five `.env` values above and restart.
- **API error:** read `.tools/dev-api.stderr.log`.
- **Editor import warnings:** select `backend/api/.venv` using VS Code's
  **Python: Select Interpreter**, then reload the window.

For **Docker, macOS/Linux, Google sign-in, tests, mobile, ESP32, or detailed
troubleshooting**, use the [advanced setup reference](docs/setup-reference.md).
