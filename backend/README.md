# Backend

Server-side SproutSync services live here.

## API

[`api/`](./api/) is the FastAPI service. It contains HTTP routes, Google OAuth,
PostgreSQL sessions, Alembic migrations, and API tests.

```powershell
py -3.12 -m venv api\.venv
api\.venv\Scripts\python.exe -m pip install -e ".\api[dev]"
api\.venv\Scripts\alembic.exe upgrade head
api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir api --reload --host 127.0.0.1
```

Do not store `.env` files, OAuth secrets, database passwords, dumps, or local
virtual environments in this folder or in Git. Use the root `.env` file and
the ignored local environment patterns.
