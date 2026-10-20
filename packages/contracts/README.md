# Integration contracts (proposed)

REST prefix: /api/v1. Implemented: GET /api/v1/health returns {"status":"ok","service":"sproutsync-api"}. OpenAPI is generated at /openapi.json by FastAPI; it is authoritative for implemented endpoints.

Proposed MQTT topics: sproutsync/v1/devices/{device_id}/telemetry, /events, /commands, /acks. Topic identities must be constrained by broker ACLs. Commands must not be retained and need an expiry and acknowledgement design before implementation.

Proposed telemetry event fields: schema_version (1), event_id (globally unique), device_id, occurred_at (UTC RFC3339), boot_id, sequence (nonnegative integer), readings (explicit units such as temperature_c, humidity_percent, water_ml). Define valid ranges from hardware specifications before enabling ingestion. Define a monotonic-time fallback when device wall-clock time is unavailable.

Replay must deduplicate by device_id + event_id. Persist the event before acknowledging it; remove queued MicroSD events only after acknowledgement. Record receipt time separately from occurrence time. Reject invalid payloads and mismatched device identities. Test retry, reordering, disk-full and power-loss behavior.

These contracts are design proposals; no ingestion or command transport is implemented yet.

