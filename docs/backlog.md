# Initial development backlog

All entries below are planned, not delivered. Owners follow SDP roles.

| Order | Slice | Owner | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Confirm requirements, device wiring and UI screens | PM + IoT + frontend | Reviewed scope, pin map and screen inventory |
| 2 | Database migrations and fixtures | Database | Fresh migration, rollback strategy, constraints tested |
| 3 | Authentication and authorization | Backend | Session expiry and unauthorized access tests |
| 4 | Devices, batches and trays | Full stack | Persist and retrieve a batch through dashboard/API |
| 5 | Telemetry MQTT ingestion | Backend + IoT | Validated events, duplicate replay and units tests |
| 6 | Firmware sensing, interlocks and local scheduling | IoT | Bench safety and offline tests with pump isolated |
| 7 | MicroSD queue and replay | IoT + backend | Power-loss recovery and idempotent replay |
| 8 | Live dashboard and alerts | Frontend + backend | Stale/disconnected indicators and alert lifecycle |
| 9 | Water use, harvest weight, yield and reports | Full stack | Calibrated calculations and traceable batch exports |
| 10 | Raspberry Pi deployment, recovery and UAT | QA + team | Restore test, offline endurance and signed acceptance |

Create an issue per slice and split it into reviewable tasks. Do not assign fabricated dates or mark thesis deliverables complete without evidence.

