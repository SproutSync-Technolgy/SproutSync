# SproutSync MVP

## Purpose

The MVP is the smallest complete software release that lets an operator
register a growing device, create a mung bean batch, monitor its conditions,
record watering activity, and see actionable alerts. It should be usable on a
local Raspberry Pi network without depending on cloud services or internet
access.

This scope targets approximately 50% of the software work. It deliberately
does not claim that hardware automation, production security, or final
analytics are complete.

## MVP outcome

An operator can:

1. Open the dashboard and sign in locally.
2. Register or select an ESP32 device.
3. Create a batch and assign it to one or more trays.
4. See the batch lifecycle: soaking, rinsing, growing, ready, harvested, or
   archived.
5. View the latest temperature, humidity, water level, and device status.
6. View recent watering events and total water used.
7. See unresolved alerts for stale telemetry, low water, drainage problems, or
   an offline device.
8. Export a batch summary as JSON or CSV.

The MVP remains safe if the internet, cloud services, or the dashboard are
unavailable. Time-sensitive pump control stays on the ESP32 and is not
delegated to the browser or API.

## Included scope

### 1. Local authentication

- Local user account with email and password.
- Password hashing and session expiration.
- Roles: `operator` and `admin`.
- Protected API routes and dashboard route guards.
- No public registration in the production deployment.

**Acceptance:** an unauthenticated request cannot read or modify operational
data; an expired session requires sign-in again.

### 2. Device and tray management

- Device identity, name, firmware version, last-seen time, and connection state.
- Tray identity, position, capacity, and active/inactive state.
- Device-to-tray relationship.
- Admin-only device registration and deactivation.

**Acceptance:** an operator can select a device and see its trays and current
connection state.

### 3. Batch lifecycle

- Batch code, seed type, seed weight, start time, target harvest time, and notes.
- Tray assignment.
- Lifecycle transitions with timestamps.
- One active batch per tray unless an admin explicitly overrides it.

**Acceptance:** a batch can be created, advanced through valid states, viewed
in the dashboard, and archived without losing its history.

### 4. Telemetry ingestion

- A versioned event contract for device telemetry.
- MQTT subscription for validated messages.
- REST endpoint for local test fixtures and replay.
- Unit normalization for temperature, humidity, water level, and volume.
- Duplicate event protection using device event IDs.
- Latest reading plus bounded historical readings.

**Acceptance:** valid events update the dashboard; invalid, duplicated, or
unknown-device events are rejected and logged without corrupting data.

### 5. Watering records

- Watering event ID, device, tray, start/end time, volume, and outcome.
- Manual record entry for testing and calibration.
- Read-only history in the dashboard.
- Daily and per-batch water totals.

The MVP may display a “manual or device-recorded” source label. Automatic pump
commands are not part of the first software MVP until hardware safety evidence
exists.

**Acceptance:** a watering event appears once, contributes to the correct
total, and remains traceable to its batch and tray.

### 6. Alerts

- Alert types: offline device, stale telemetry, low water, drainage failure,
  sensor error, and invalid event.
- Severity, created time, related device/batch/tray, and resolution state.
- Acknowledge and resolve actions with the responsible user.
- Dashboard alert count and alert list.

**Acceptance:** alerts are created from defined thresholds, remain visible
until acknowledged or resolved, and record who changed their state.

### 7. Dashboard screens

Implement these screens after the public landing page:

| Screen | Required content |
| --- | --- |
| Sign in | Local authentication and error states |
| Overview | Active batches, device status, alert count, latest telemetry |
| Batches | Search, status filter, create, detail, and lifecycle actions |
| Batch detail | Trays, timeline, telemetry, watering, alerts, and export |
| Devices | Device list, connection state, last-seen, and tray assignments |
| Alerts | Filterable unresolved and resolved alert history |
| Settings | User profile, units, and local system information |

**Acceptance:** a user can complete the core operator workflow without using
Swagger or direct database access.

## Data model for the MVP

The first database migration should contain these tables:

| Table | Main responsibility |
| --- | --- |
| `users` | Local accounts, role, password hash, timestamps |
| `sessions` | Expiring authenticated sessions |
| `devices` | ESP32 identity, status, and firmware metadata |
| `trays` | Tray position and device relationship |
| `batches` | Batch details and current lifecycle status |
| `batch_trays` | Batch-to-tray assignment history |
| `telemetry_readings` | Validated sensor readings |
| `watering_events` | Water usage and watering outcomes |
| `alerts` | Operational alert lifecycle |
| `audit_events` | Security-sensitive and operational changes |

Every operational table needs an immutable ID, created timestamp, and
appropriate foreign keys. Measurements must store units or use a documented
canonical unit.

## MVP API surface

The exact schemas belong in `packages/contracts/`, but the initial API should
cover:

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/overview
GET    /api/v1/devices
POST   /api/v1/devices
GET    /api/v1/devices/{device_id}
GET    /api/v1/devices/{device_id}/telemetry

GET    /api/v1/batches
POST   /api/v1/batches
GET    /api/v1/batches/{batch_id}
PATCH  /api/v1/batches/{batch_id}
GET    /api/v1/batches/{batch_id}/export

GET    /api/v1/alerts
POST   /api/v1/alerts/{alert_id}/acknowledge
POST   /api/v1/alerts/{alert_id}/resolve
POST   /api/v1/test-fixtures/telemetry
```

The fixture endpoint must be disabled or protected outside local development.

## MVP delivery milestones

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| M1 | Contracts and database migration | Fresh database creates all MVP tables |
| M2 | Authentication and authorization | Login, expiry, role, and unauthorized tests |
| M3 | Devices, trays, and batches | Batch can be created and retrieved end-to-end |
| M4 | Telemetry and watering history | Valid fixture updates dashboard and totals |
| M5 | Alerts and dashboard screens | Operator workflow works without direct API calls |
| M6 | Export, recovery, and UAT | Backup/restore, replay, and acceptance records |

## Explicitly out of MVP

- Automatic pump or valve actuation from the API.
- Production firmware GPIO implementation.
- Final sensor calibration and electrical safety certification.
- Cloud synchronization or Supabase dependency.
- Native Android/iOS application.
- AI recommendations.
- Multi-site tenancy and billing.
- Advanced yield forecasting and analytics.
- Public sign-up and social login.
- Production internet exposure without TLS and device ACLs.

## Definition of done

The MVP is done only when:

- All included routes have request, authorization, validation, and failure tests.
- A fresh installation works using the documented setup.
- A database backup can be restored on a clean instance.
- Duplicate telemetry replay is idempotent.
- The dashboard shows stale and disconnected states clearly.
- Exported data can be traced to a batch and its source events.
- Security review covers authentication, MQTT, secrets, and local deployment.
- UAT evidence is recorded for the core operator workflow.

