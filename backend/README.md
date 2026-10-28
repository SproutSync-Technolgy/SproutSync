# Backend

`api/` contains FastAPI routes, Supabase bearer-token verification, SQLAlchemy
models, Alembic migrations, and API tests. See **[SETUP.md](../SETUP.md)** for
configuration and Windows/macOS/Linux instructions.

For native Windows development, run from the **repository root**, after creating
and filling the root `.env` for one matching Supabase project:

```powershell
py -3.12 -m venv backend/api/.venv
backend/api/.venv/Scripts/python.exe -m pip install -r requirements.txt
backend/api/.venv/Scripts/python.exe -m app.check_setup
backend/api/.venv/Scripts/python.exe -m alembic -c backend/api/alembic.ini upgrade head
backend/api/.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On macOS/Linux use `.venv/bin/python`. The editable requirements install makes
`app` importable from scripts at the repository root. The API requires the same
Supabase database used by the browser; SQLite is used only in isolated tests.
Keep environment files, passwords, local environments, and dumps out of Git.
