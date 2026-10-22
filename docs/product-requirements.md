# Product Requirements Document

## 1. Product overview

SproutSync is a web-first operations system for mung bean sprout production.
It gives growers a simple way to manage batches and watering records while
giving administrators visibility into users, operational status, and alerts.
The future device layer supplies telemetry and safe local automation; the web
application must remain useful when devices or the network are unavailable.

Prototype reference: [SproutSync Figma prototype](https://sproutsync-prototype.figma.site/).

## 2. Users and goals

| User | Goal | Primary success measure |
| --- | --- | --- |
| Visitor | Understand the product and start sign-in | Can find the correct workspace CTA |
| Grower | Manage production without spreadsheets | Can create and track a batch in under two minutes |
| Administrator | Maintain people, operations, and system visibility | Can identify an issue and its owner quickly |
| Future device | Publish trustworthy readings and receive safe configuration | Events are validated, traceable, and replay-safe |

## 3. Product requirements

### PR-01 Identity and access

The system shall authenticate users through the configured Google OAuth flow,
create a server-side session, and enforce the user's role in the API. A user
must not access another grower's operational data.

### PR-02 Batch lifecycle

Growers shall create, view, update, and archive batches. A batch contains a
human-readable code, seed information, start date, target harvest date, stage,
status, and notes. Valid stages are soaking, rinsing, growing, ready,
harvested, and archived.

### PR-03 Operational records

The system shall support watering records, condition readings, water-use
summaries, and alerts. Manual records are valid while hardware integration is
not available.

### PR-04 Workspaces

The grower workspace shall show active batches, schedule information,
conditions, water use, and alerts. The admin workspace shall show users,
batches, alerts, and read-only device health.

### PR-05 Resilient UX

Every data-driven screen shall expose loading, empty, success, error, offline,
and permission-denied states where applicable. No screen shall imply that
preview data is live.

### PR-06 Traceability

Changes to batches, watering, alerts, and identity shall be attributable to a
user or a device event. Exports must identify the source records and units.

## 4. Non-functional requirements

- Accessibility target: WCAG 2.2 AA for keyboard navigation, focus, labels,
  contrast, and meaningful status text.
- Security target: least privilege, secure HTTP-only sessions, validated input,
  no credentials in source control, and auditable authorization decisions.
- Reliability target: a temporary API/device outage produces an explicit
  degraded state instead of fabricated success.
- Performance target: local dashboard API responses should normally complete
  within 500 ms for the MVP dataset.
- Maintainability target: each vertical slice includes documentation, tests,
  migration notes, and a focused PR.

## 5. Release boundaries

The first web release includes identity, batches, watering records, conditions,
alerts, and role-aware dashboards. ESP32 firmware, pumps, valves, electrical
work, MQTT production ingestion, and physical safety certification are tracked
separately in GitHub issues #21 and #22.

## 6. Acceptance

The product requirement set is accepted when a grower can sign in, create and
review a batch, and see honest empty/loading/error states; an administrator can
review system records; and the documented API/database contracts are approved.
