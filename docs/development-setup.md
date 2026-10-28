# Development setup

**[SETUP.md](../SETUP.md) is the setup source of truth.** It includes Windows,
macOS/Linux, requirements.txt installation, the root environment template,
Docker/native API startup, full local Supabase, migration checks, and optional
Flutter/PlatformIO instructions.

The old quick start that copied `.env.example` and immediately started plain
PostgreSQL was insufficient: the current app uses Supabase Auth, PostgREST, and
RPCs, and migrations need Supabase schemas and roles. Fill the five required
values for one matching development project before starting services.

Use `npm ci` for the locked frontend packages and your virtual environment's
`python -m pip install -r requirements.txt` for native Python development.
Do not copy virtual environments or SDK directories between machines.
