# MVP readiness and completion checklist

Assessment: 10 November 2026. **The complete SproutSync MVP is not yet achieved.**
The connected web prototype implements many core workflows, but demonstration
records, successful builds, and broker authentication do not satisfy end-to-end
hardware, offline, recovery, and user acceptance criteria.

## Which MVP?

The [original MVP](mvp.md) requires use on a local Raspberry Pi network without
cloud/internet dependencies. The current implementation uses hosted Supabase
Auth/PostgREST/Realtime and an external MQTT broker. These are different operating
assumptions. The team must either formally accept a connected MVP or complete a
local Supabase/auth/broker deployment and prove offline use. This assessment does
not silently redefine the original scope or mark its acceptance complete.

## Acceptance matrix

| Requirement | Current evidence | Status / remaining acceptance |
| --- | --- | --- |
| Authentication and role boundaries | Supabase login, profile/role routing, API permission and RLS checks | Implemented; repeat real signup/OAuth, session-expiry and email-delivery checks in staging |
| Operator batch lifecycle | Persisted records, search, create, inspect, update/archive, duplicate/date checks | Core flow implemented; formal user acceptance and full tray assignment remain |
| Device identity and registration | Printed serial grants, local mDNS/BLE identity workflow, ownership tests | Implemented software path; actual firmware advertisement and physical pairing need bench evidence |
| Real sensor-to-dashboard chain | MQTT validation, persistence, broker login and recovery tests | Partial; capture a real timestamped ESP32 packet, database row and authorized web/mobile display |
| Physical irrigation | Saved schedule records and watering history | Partial; no validated dispatch/acknowledgement or demonstrated pump execution |
| Water-use correctness | Stored ml values and litre totals/charts | Partial; finish event-entry/source rules and compare against calibrated flow measurement |
| Alerts | Device-fault deduplication/recovery, persisted issue reports, unread preferences and status handling | In-app software path verified; general threshold rules, real-device acceptance and external delivery remain |
| Evaluator assessment | Shared batches, star selection, prefilled form, comments and persisted evaluation | Software path implemented; evaluator UAT and independent-review acceptance remain |
| Superadmin operations | Persisted account/grant APIs, corrected overview actions, visible errors and safe deletion conflicts | Software path implemented; test the exact deployed roles/configuration and operational account lifecycle |
| Offline safety and replay | UI exposes unavailable/stale state | Incomplete; durable queue, replay, power-loss, controller-local automation and no-data-loss tests |
| Recovery and deployment | Local launchers, migrations, CI definitions and setup instructions | Partial; actual deployed CI, staging, backup restore, monitoring and rollback evidence required |
| Native mobile | Flutter client and development APK | Partial; real-device flows, current server contracts, distribution/signing and any required push/offline behavior |

## Smallest route to an accepted connected MVP

1. Approve the connected-versus-offline operating scope and the final role/task list.
2. Finish the batch/tray and watering-entry gaps; remove any remaining preview-only
   metric or action from operational paths.
3. Have the IoT specialist provide the actual firmware revision, wiring/GPIO map,
   sensors/units, calibration results, event identity and sample payloads.
4. Demonstrate one real controller publishing through authenticated MQTT into
   PostgreSQL and the authorized dashboard. Test invalid identity and replay.
5. Demonstrate schedules, command expiry/acknowledgement, interlocks and emergency
   stop with documented safe bench procedures. Saving a schedule is insufficient.
6. Test broker/API/database outages, restart, power loss, clock skew and recovery.
7. Run staging checks with real Operator, Evaluator and Superadmin accounts;
   record tester, commit, expected/actual outcome and acceptance decision.
8. Restore a backup into a clean environment, verify permissions and migrations,
   then document deployment, monitoring and rollback.

## What the current sample records establish

`scripts/seed_development_samples.py` adds a dedicated offline demo chamber,
six batches/trays, fourteen synthetic watering events, three sample schedules,
and three pending inspections for an explicitly selected existing active
operator. All rows carry `is_demo=true`; batch codes start with `DEMO-SS-`.
It creates no sensor readings, evaluations, MQTT publications, role changes or
new evaluator access grants. The demo device has no MQTT topic binding and is
excluded from real ingestion. Its schedules are stored examples, not commands.

The command defaults to a complete rollback-only trial; `--apply` saves the
records. It verifies that a repeat creates no duplicates. Existing real data is
not replaced. Repeating the command does not refresh an old sample schedule's
date or rewrite an edited demonstration record.

```powershell
backend/api/.venv/Scripts/python.exe scripts/seed_development_samples.py --operator-email operator@example.invalid
# Add --apply only for the intended development database/operator.
```

Seeing non-zero demonstration cards is useful for UI review; it is not evidence
of water consumption, sensor health, pump execution or MVP acceptance.

## Validation sources

Use `backend/api/tests/`, `frontend/dashboard/tests/workspace.spec.ts`, the
rollback-only PostgreSQL verification scripts, launcher lifecycle tests, and
documented physical test reports. Tests that mock Supabase or Bluetooth do not
prove real email delivery, device pairing or physical safety. CI configuration
does not establish that its hosted runs passed. Record each result rather than
using an unexplained percentage to decide completion.
