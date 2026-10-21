# Database development

PostgreSQL 17 is provisioned in Compose. There are no application tables or migrations yet.

Planned entities: users/roles, devices, batches, trays, sensor_readings, irrigation_cycles, alerts, harvests and audit_events. Include foreign keys, UTC timestamps, explicit measurement units, indexes for device/time and replay deduplication constraints.

Introduce SQLAlchemy and Alembic with the first persistence slice. Commit reviewed versioned migrations under database/migrations; do not generate an unverified schema from inferred requirements. Seed only synthetic development data. Capture seed weight, harvest weight and measured water volume for traceable water/yield calculations.

Document backup/restore and retention before collecting real records. Supabase remains an optional managed target; local operation takes priority.

# Database

SproutSync uses PostgreSQL for persistent application data. Database schema
changes are managed with Alembic migrations in
[`services/backend/api/migrations/`](../services/backend/api/migrations/).

## First migration

After starting PostgreSQL:

```powershell
Push-Location services\backend\api
.venv\Scripts\alembic.exe upgrade head
Pop-Location
```

The migration creates the initial `users` and `sessions` tables used by Google
authentication. The API stores only a SHA-256 hash of the session token; the
raw token exists only in the HTTP-only browser cookie.

## Database URL

Local development uses:

```text
postgresql+psycopg://sproutsync:local-development-only@127.0.0.1:5432/sproutsync
```

Set `DATABASE_URL` in `.env` for another environment. Do not commit production
credentials or database dumps.

## Planned tables

The MVP will add devices, trays, batches, telemetry readings, watering events,
alerts, and audit events through additional reviewed migrations. Each migration
must include constraints, a rollback strategy, and tests against a fresh
database.
