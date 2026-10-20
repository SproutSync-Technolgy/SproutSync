# Database development

PostgreSQL 17 is provisioned in Compose. There are no application tables or migrations yet.

Planned entities: users/roles, devices, batches, trays, sensor_readings, irrigation_cycles, alerts, harvests and audit_events. Include foreign keys, UTC timestamps, explicit measurement units, indexes for device/time and replay deduplication constraints.

Introduce SQLAlchemy and Alembic with the first persistence slice. Commit reviewed versioned migrations under database/migrations; do not generate an unverified schema from inferred requirements. Seed only synthetic development data. Capture seed weight, harvest weight and measured water volume for traceable water/yield calculations.

Document backup/restore and retention before collecting real records. Supabase remains an optional managed target; local operation takes priority.

