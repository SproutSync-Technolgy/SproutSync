# Telemetry storage and usable operations

Implemented 11 November 2026. This change targets the operator's daily monitoring
and record keeping, and the evaluator's independent review. It does not add
remote pump control or claim that hardware safety has been validated.

## Assessment of the previous experience

An operator could see a green broker banner, red controller warnings, and zero
measurements together. Those signals did not answer the useful question:
“Can I trust this chamber's current measurements?” A list of hundreds of page
buttons and repeated explanatory cards made the next action harder to find.

An evaluator needs trustworthy timestamps, clear missing measurements, and an
assessment associated with the right batch. Averages must not replace live
values; a star rating must remain a human assessment rather than alter telemetry.

The revised interface keeps one header connection control, puts task information
before optional guidance, and uses specific actions such as Create batch, Save
maintenance record, and Save assessment. The aim is to support first-time,
interrupted users without requiring knowledge of MQTT or the database schema.

## Live updates and saved history

`TELEMETRY_SAMPLE_SECONDS=60` is the default. The server accepts and validates
each fresh packet, updates the device heartbeat, and maintains the latest packet
in a bounded in-memory cache. `/api/v1/devices/live` returns that cache separately
as `latest_readings`, alongside the existing persisted-reading delta contract.
The foreground web workspace checks it every two seconds. A connected broker
does not by itself prove that any device is online.

Persisted history contains:

- The first accepted packet for a chamber.
- An ordinary sample when at least 60 seconds have elapsed since its last saved
  sample. It saves the next received packet, rather than manufacturing a timed
  measurement when the chamber is offline.
- Immediate records when the sensor status or SD-card status changes, including
  recovery. These exceptions can add records within the sampling interval.

At one packet per second, this changes ordinary history growth from about 86,400
to 1,440 records per chamber per day: roughly 98% fewer rows, excluding status
changes. Each row is an actual selected sample, not an average of the discarded
packets; `sample_count=1` retains that meaning. Historical charts consequently
do not prove the absence of short transients between saved samples.

The heartbeat is still updated in PostgreSQL for every accepted packet. This
change reduces inserted history rows, not all database writes or MQTT traffic.
The new partial index supports finding the most recent raw sample efficiently.

`SYSTEM OFF`, `POWER OFF`, and `OFF` normalize placeholder sensor zeroes to null.
The web also treats old stored off-state records as unavailable when rendering
or exporting them, without rewriting those historical records. A real zero lux
reading from a functioning sensor remains zero. SD-card failure preserves other
valid measurements. Missing values use a dash; stale values are labelled Last
known instead of appearing as healthy live readings.

Message identifiers already saved in the database reject duplicates. The live
cache additionally remembers the most recent 128 identifiers per chamber, so
an unsaved duplicate does not extend its heartbeat. Packets without identifiers
cannot be deduplicated beyond the existing timestamp and binding checks.

The cache stores at most 256 chambers, checks owner/topic/reconnection boundaries,
and clears on shutdown. A restart waits for the next fresh packet; saved history
is still available. The supported development deployment is one API subscriber
process. Multiple workers/replicas require a shared live-state strategy and
verified MQTT delivery behavior before promising consistent live reads across
replicas. The cache is not a durable queue.

## Retention decision

Existing readings are retained. Sampling slows growth but does not cap lifetime
storage. There is still no enabled automatic history compactor or deletion job.
The existing hourly/daily schema fields are not evidence of an active worker.

A reasonable next retention policy to review with the project owner is 30 days
of selected samples, hourly summaries for 12 months, and daily summaries after
that. These are proposed product decisions, not ISO requirements. Confirm the
evaluation/reporting period and storage budget before enabling deletion. Build
and verify weighted aggregates, missing-value counts, fault counts, backups,
late-packet handling, and a dry-run report before removing source history.
Time-series platforms document the same separation between retention and
aggregation; see [TigerData's retention guidance](https://www.tigerdata.com/docs/learn/data-lifecycle/data-retention/data-retention-with-continuous-aggregates).
SproutSync does not currently install TimescaleDB or its retention policies.

## Status, notifications, and forms

The header circle opens chamber details on hover or keyboard focus and stays
open when clicked or tapped. Escape and outside interaction dismiss it. The
panel includes text as well as colour, last-packet time, and a retry action.
The update service and the chamber's health are separate entries.

Device fault transitions create one active automatic fault alert per chamber.
Repeated packets do not create duplicate alerts. A healthy sensor status resolves
the automatic fault alert. This does not resolve a manually reported inspection
issue. Connection loss is displayed as offline; this change does not implement
offline push notifications or a general agronomic threshold rule engine.

Notification changes arrive through Supabase Realtime, with foreground recovery
checks every 30 seconds. Failures keep saved alerts visible with a retry message.
The bell counts unread active alerts according to the account preferences.
Mark all as read persists a per-user timestamp using the newest displayed alert;
it does not acknowledge or resolve incidents. Resolving an alert remains a
separate permitted action. There is no background OS push or email delivery.

The current-situation form now saves a real alert through
`POST /api/v1/devices/{device_id}/issues`, with optional batch association, a
server-validated owner boundary, audit attribution, and an idempotent request ID
for safe retries. An operator cannot report against another operator's chamber
or batch. Evaluators cannot submit operational issue reports through this route.
Saving a report does not stop equipment or automatically summon a responder.

Shared record forms have visible labels, local-time date defaults, a suggested
unique batch code, automatic selection when there is one available chamber,
field help, explicit optional inputs, linked error summaries, preserved input,
pending feedback, and Cancel. Irrigation duration has no automatic default:
the operator must supply the intended duration. Saving a plan sends no hardware
command. Dialog headings stay visible while long content scrolls, and focus is
restored to the opener after closing. Table pagination is bounded to Previous,
Next, and Page X of Y; the displayed count explicitly describes loaded records.

## References and quality acceptance

[Home Assistant dashboards](https://www.home-assistant.io/dashboards/) informed
the focus on current device conditions and direct actions. The implementation
uses SproutSync's existing forest green, warm neutral background, white surfaces,
amber attention states, and red errors rather than copying a decorative mockup.
[GOV.UK's error-summary pattern](https://design-system.service.gov.uk/components/error-summary/)
informed linked field errors and focus after failed validation.

[ISO 9241-210:2019](https://www.iso.org/standard/77520.html) is the human-centred
design reference. [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)
provides a product-quality reference model. Their publicly available descriptions
inform the measurable acceptance criteria below; this is not a claim of formal
conformity, a full clause-level assessment, or ISO certification. Neither source
is a basis for claiming that ISO requires a 60-second sampling interval.

| Quality concern | Acceptance behavior | Evidence |
| --- | --- | --- |
| Functional accuracy | Fresh live values continue between saved samples; off-state placeholders are unavailable; valid zeroes remain zero | MQTT/API tests; rollback-only PostgreSQL verification; browser status test |
| Efficient storage | 62 ordinary packets spanning 61 seconds produce two saved rows at the default interval | MQTT sampling test |
| Reliability | Fault and recovery changes bypass sampling; duplicate packets do not extend heartbeat; retries reuse a report ID | MQTT/API tests and report retry browser flow |
| Access control | Unauthorized owners and evaluators cannot submit operational reports or read another workspace's live cache | API tests and PostgreSQL RLS checks |
| Understandable interaction | Defaults reduce repeated entry; date/duration errors identify the field; failed saves retain input | Browser task-form tests |
| Keyboard and touch access | Status detail works on focus/click, Escape restores focus, dialogs fit 390px screens | Browser navigation/status tests and reviewed screenshots |
| Traceability | Issues retain operator, chamber, optional batch and audit actor; reading and resolving notifications are separate | API and PostgreSQL verification; browser read-state test |

Repeatable checks:

```powershell
backend/api/.venv/Scripts/python.exe -m pytest backend/api/tests -q -p no:cacheprovider --basetemp "$env:TEMP\sproutsync-quality-tests"
backend/api/.venv/Scripts/python.exe scripts/verify_field_workflows.py
npm.cmd run build --workspace frontend/dashboard
npm.cmd run test:browser --workspace frontend/dashboard
```

The PostgreSQL verification uses synthetic records inside a rolled-back
transaction; it sends no hardware commands. Apply migration `0019_field_workflows`
before running it. In Linux, use the venv's `bin/python` and `npm` equivalents.

Remaining acceptance work: representative operator/evaluator usability sessions,
screen-reader review, sustained load/storage measurements, real ESP32 fault and
recovery bench tests, network/power-loss tests, and an agreed retention policy.
Software tests do not establish physical safety or complete the hardware MVP.

Verification on 11 November 2026: 82 backend tests passed, all 26 dashboard
browser tests passed, and the production dashboard build passed. PostgreSQL
workflow/RLS verification passed with all synthetic records rolled back.
Migration `0019_field_workflows` was applied to the configured development
database after rollback-only validation. Local HTTP checks confirmed that the
updated workspace is served and anonymous live/report API requests are rejected.
