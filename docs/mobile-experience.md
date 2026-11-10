# SproutSync Field: mobile purpose and delivery

Updated 10 November 2026.

## Why a separate mobile application?

SproutSync Field is an installed Flutter application for a person standing beside
a chamber or walking between batches. Its job is to answer: **What needs my
attention, which record is in front of me, and what observation or action should
I record?** It has its own navigation and interactions. It does not require the
web dashboard to be running or open, and it uses the same authenticated Supabase
HTTP APIs and row-level permissions so the two applications share one source of
truth. An account still needs activation and the correct operator/evaluator grant.

Independent application does **not** mean independent data, a second account,
automatic offline operation, or a replacement for the chamber controller.
Internet access to the configured Supabase project is currently required.
The backend MQTT worker must still ingest sensor packets. A fresh UI refresh
does not make an old device measurement fresh.

## What a user sees and can do now

| Area / feature | Purpose and actual behavior | Boundary |
| --- | --- | --- |
| Today | Friendly greeting, active batch/chamber/open-alert counts, urgent alerts, individual chamber conditions, next saved rinse plan, recent active batches | Real authorized records; sample labels remain visible. Counts reflect available sources and a failure notice identifies unavailable data |
| Chamber cards | Temperature, humidity and available tank level for that particular device, reading age, heartbeat status and source | No invented readings or cross-chamber temperature. Readings older than five minutes, missing/future timestamps, sample devices and refresh failures cannot be labelled recent/live |
| Chamber details | Device identity, heartbeat, firmware if supplied and recent maintenance | Operators can record maintenance against the selected device; no second scan is required |
| Label scanning | Camera scan or manual batch code/chamber serial opens a visible authorized record | Accepts plain identifiers and `sproutsync://batch/MB-001` or `sproutsync://device/SS-001`; arbitrary website links are rejected. A label grants no access |
| Batches | Search code, seed, stage or operator number; Active / Archived / All filters | Available without owning a camera or scanning a label |
| Batch details | Stage/status, start/target-harvest times, operator notes, matching recent evidence and assessments | Recent evidence/assessment panels are explicitly drawn from the latest 50 visible records; historical reporting remains on the web |
| Operator update | Update stage and notes, or archive a batch through the existing validated form | Server/RLS confirms writes. Archived records are read-only on mobile |
| Evaluator assessment | Five touch-sized stars open a form with the chosen batch and rating already selected, then required comments | A real human assessment is saved separately from telemetry. Failure preserves form input; no automatic write on star selection |
| Alerts | Open / Resolved / All filters, batch context, severity, time, message and recommended action | Operators can acknowledge or resolve, with confirmed persistence and retry. Evaluators review without operational mutation controls |
| Account | Profile review, role purpose, in-app alert/harvest badge preferences and sign-out | Preferences are persisted. These switches do not claim background phone push delivery |
| Refresh and recovery | Pull-to-refresh, explicit retry, resume refresh, 30-second foreground recovery and debounced database change invalidation | Last available records stay in memory with a visible warning after failure. No disk cache or queued offline mutations |
| Loading and motion | Page-shaped loading placeholders, refresh progress, material touch feedback and short navigation fades | Navigation fades respect the phone's reduced-animation preference. Save controls disable while a write is pending |
| Access pending | Explicit access screen before an unsupported/inactive role enters the workspace | Existing RLS remains the security boundary; client-side role visibility alone never authorizes a write |

Administration, detailed production planning, exports, user provisioning, serial
grants and historical analytics belong in the web workspace. Mobile equipment
registration was removed because its previous direct insert did not perform the
web's serial-grant/connection validation. The unconnected incident draft was
also removed from the main mobile journey: every promoted action has an outcome.

## A normal round

1. Open Today and check urgent alerts and each chamber's measurement age.
2. Scan the chamber label, inspect its identity and conditions, and record any
   maintenance performed. A maintenance record is human evidence, not a command.
3. Open a batch by search or scan. The operator updates stage/notes; an evaluator
   selects stars and records independent observations.
4. Open an alert, follow the recommended inspection, and acknowledge or resolve
   it when appropriate. Acknowledgement does not itself fix equipment.

## Color and interaction decisions

| Token | Hex | Use |
| --- | --- | --- |
| Forest | `#185B42` | Brand, primary actions and selected navigation |
| Cream | `#F5F7F2` | Calm daylight background |
| White | `#FFFFFF` | Reading and task surfaces |
| Mint | `#E7F2EA` | Selected/neutral emphasis |
| Water blue | `#235F82` | Moisture and informational context |
| Amber | `#875500` | Warnings and rating controls |
| Red | `#B3261E` | Critical conditions and errors |
| Ink / muted | `#1C3028` / `#52665B` | Body and supporting text |

This palette is a product choice for readable greenhouse use, not a scientific
claim that one color is universally best. Status also has words and icons.
Layouts use wrapping content, persistent labels, large star targets, local-time
dates, scrollable details and four labelled navigation destinations.
Motion is a short 180 ms fade rather than a constantly moving dashboard.

The design takes the at-a-glance, per-device organization from
[Home Assistant's dashboard approach](https://www.home-assistant.io/dashboards/),
uses native [Material navigation](https://m3.material.io/components/navigation-bar/overview),
and follows the practical touch-target, contrast, actionable-control and large-text
checks in [Flutter's accessibility guidance](https://docs.flutter.dev/ui/accessibility).
These references informed the design; no external template or artwork was copied.

## Future features, in a realistic order

| Priority | Candidate | Benefit | Work required before shipping |
| --- | --- | --- | --- |
| Next | Per-batch paginated evidence/history | Find older evidence without loading the entire reporting warehouse | Stable pagination, filters and source-specific retry |
| Next | Native push for critical/harvest alerts | Reach a user while the app is closed | FCM/APNs setup, server delivery, token lifecycle, permission request, deduplication and alert ownership |
| Next | Photo evidence linked to batch/device | Document contamination or equipment inspection at its location | Storage policies, upload limits, capture permissions, compression, privacy and failure recovery |
| Next | Read-only offline cache | Check the last synchronized round during a brief outage | Account-isolated encrypted storage, visible age, logout erasure and retention policy |
| Later | Draft observations with explicit send | Avoid losing notes during outages | Durable drafts, idempotency keys, conflict handling and an unmistakable unsent state; keep physical commands out of the queue |
| Later | Printable/validated QR labels | Faster identification without typing | One label contract shared by web/mobile, printing and damaged-label fallback |
| Later | Personal round checklist / harvest reminders | Reduce repeated navigation | Defined task owner, due-time semantics, acknowledgement and optional delivery |
| Only after hardware proof | Safe irrigation requests | Request a documented controller action | Authorization, expiry, acknowledgements, interlocks, emergency stop and physical bench evidence |

AI crop diagnosis, social feeds, payments, maps, automatic irrigation based on
weather and full administrative parity do not resolve the current field tasks.
They are outside this delivery. No paid service or new runtime dependency was
added for this redesign.

## Review and release

Use `flutter analyze`, `flutter test` and the existing Android build helper.
Workflow tests use isolated records and verify search/filter behavior, selected
stars and batch context, failed-save recovery, confirmed alert updates, retained
stale views and narrow-screen settings. They do not establish physical pairing,
sensor calibration, real email delivery or pump safety.

The APK is a development preview. Test camera permissions, scan/manual entry,
TalkBack, actual phone font scaling, sign-in callbacks and real account isolation
on a phone before distribution. iOS packaging needs macOS/Xcode and signing.
See [mobile/README.md](../mobile/README.md) for setup and build instructions.
