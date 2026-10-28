# SproutSync new-machine setup handout

Follow **[SETUP.md](../SETUP.md)** for the complete, maintained instructions on
Windows, macOS, and Linux. It covers system tools, installation commands,
configuration, Supabase Auth/database setup, starting/stopping the app,
validation, and troubleshooting.

Before starting:

1. Install Git, Node 22.12+, and Docker/Compose (or Python 3.12 for a native API).
2. Clone the repo. Copy `.env.example` to `.env` only if it does not already exist.
3. Fill `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` for one development project.
4. Run `npm ci`, then `npm run check:setup -- --docker`.
5. Run `docker compose up --build --wait --wait-timeout 120 api`, then `npm run dev`.

On PowerShell use `npm.cmd`. `start.bat` automates steps 4 and 5 on Windows and
stops when setup or API startup fails. Open http://localhost:5173.

Plain PostgreSQL is not a full Supabase stack. Never share server secrets or put
them in browser/mobile variables. For a native API, use the virtual environment
and `requirements.txt` workflow in SETUP.md, including migrations before Uvicorn.
