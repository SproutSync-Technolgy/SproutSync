# SproutSync feature guide

Reviewed 11 November 2026. This is a description of the implemented repository,
its limitations, and proposed work. A working screen does not establish hardware
operation or production readiness. See [MVP acceptance](mvp-readiness.md) and
[API setup and free services](api-setup-and-free-services.md).

## Who uses the system?

| Role | Job | Boundary |
| --- | --- | --- |
| Visitor | Understand the product, register, sign in, or obtain the mobile preview | Cannot read operational records |
| Pending account | Request access and complete its profile | No production ownership until the correct role is assigned |
| Operator | Manage batches, plans, maintenance, and evaluator access | Own records only; cannot fabricate machine readings or independently assess its own batch as an evaluator |
| Evaluator | Inspect shared evidence and record a separate quality assessment | Cannot change the operator's production or device measurements |
| Superadmin | Manage accounts, roles, chamber grants, and fleet oversight | Administrative actions require server permission; no unsafe hardware controls |
| ESP32 controller | Report sensor observations and eventually execute validated local automation | Safety must remain effective without a browser or cloud connection |

## Identity and access

| Feature | How it is used | Why it exists | Current limit |
| --- | --- | --- | --- |
| Email sign-up and sign-in | Register, verify the account through configured Auth, then complete a profile | Gives each saved action an identity | Hosted Auth/email settings and real delivery need environment validation |
| Google sign-in | Start Google OAuth through Supabase and return to the workspace | Reduces password handling and onboarding effort | Requires the Google provider, client credentials, consent configuration, and allowed redirects in Supabase |
| Personal details | Confirm name, organization, and contact information | Makes operator/evaluator records understandable | Email changes need the configured server/admin flow; profile saves should be verified after reload |
| Role-based entry points | Use `/operator`, `/dashboard`, or `/superadmin` | Keeps tools appropriate to the user's responsibility | A route guard complements, but never replaces, API authorization and RLS |
| Row-level data access | Supabase policies restrict owners and evaluator grants | Prevents another grower's data from appearing in the client | New migrations and integrations must preserve these policies |
| Pending access request | Give the designated operator's email and request evaluator access | Makes permission requests explicit | The operator must approve the request before records are visible |
| Evaluator assignment and grants | Superadmin assigns an evaluator; operators manage allowed access | Enables independent review without sharing accounts | No sample grant is created automatically |
| Sign-out confirmation | Open the top-right account menu and confirm sign-out | Prevents accidental loss of the working session | Does not represent device shutdown |

## Daily production and monitoring

The web header and native field app now share an authenticated search over
permitted saved records, with page shortcuts and direct record opening. Web
operators can also find existing task forms such as Create batch and Add device.
The GreenGenie/agriculture-reference layout update and search limits are
documented in [workspace search and design](workspace-search-and-design.md).

| Feature | How it is used | Why it exists | Current limit |
| --- | --- | --- | --- |
| Welcome panel | Shows a usable name and role context; dismiss it for the session | Helps users orient themselves | Uses the saved profile, with a display-name/email fallback; does not rewrite identity data |
| Overview cards | Open the relevant records from a summary | Makes the next action clear | Missing sensor or schedule information is shown explicitly, not as “Normal” or “Scheduled” |
| Grouped navigation | Expand production/review, monitoring, or administration sections | Reduces sidebar clutter | Only the permitted destinations are rendered |
| Mobile navigation | Use the bottom bar or the complete navigation dialog | Keeps all permitted pages reachable on a small screen | The web interface is responsive; it is separate from the native Flutter app |
| Batch creation | Enter code, crop, start date, expected harvest, and notes | Creates the central traceability record | Duplicate codes and invalid date ordering are rejected; full tray-allocation UX needs completion |
| Batch lifecycle | Inspect a batch and update its growth stage/status | Tracks soaking, rinsing, growing, readiness, harvest, and archive | Lifecycle transitions are recorded, but crop success is not inferred from a stage label |
| Batch search and filters | Search codes and filter stage/status/month/date | Finds the relevant production run quickly | Search and numbered pages currently work over loaded authorized records |
| Batch inspection | Open the notebook/details action | Brings readings, watering, evidence, and assessments into context | Device-wide evidence is not automatically a calibrated measurement for one tray |
| Device registration | Search Wi-Fi/Bluetooth or connect an assigned printed serial | Links the physical identity to an owner and topic | Requires compatible advertising firmware; a model name alone cannot be discovered reliably |
| Wi-Fi discovery | Scan from the local API on the same network | Avoids manual transcription of device identity | mDNS is local-network discovery; a remote cloud API cannot scan the user's LAN |
| Bluetooth identity read | Let a supported browser choose a board and read its GATT identity | Confirms which nearby SproutSync device is selected | HTTPS/localhost, browser support, Bluetooth permission, and advertising firmware are required |
| MQTT ingestion | Backend subscribes to the configured broker and validates packets | Persists device evidence independently of the browser | A persistent backend process is required; authentication to the broker alone is not an end-to-end sensor test |
| Live readings | View temperature, humidity, fresh/wastewater, water temperature, light, voltage/SD status when supplied | Supports observation of current conditions | Missing/faulty values remain unavailable; no invented sensor values are added by the sample-data script |
| Connection and stale status | Inspect last-seen, pending/offline/fault status, and API/broker errors | Prevents old readings being mistaken for live measurements | Hardware reconnect, power-loss, and endurance evidence remain separate acceptance work |
| Realtime plus recovery | Current packets refresh every two seconds through API or scoped Supabase snapshots; Realtime delivers saved records | Keeps current sensor values separate from averaged history | Durable partial windows survive restarts; a running MQTT collector is required |
| Historical readings | Browse minute/five-minute means, state events, and existing raw/hourly/daily records | Keeps normal history compact while retaining fault detail and per-sensor ranges | Current cards use latest packets. Normal history averages five minutes; fault windows retain minutes. Old history is retained |

## Irrigation, evidence, and evaluation

| Feature | How it is used | Why it exists | Current limit |
| --- | --- | --- | --- |
| Irrigation schedule records | Save a device, next-run time, duration, and enabled state | Documents intended rinse plans | Saving a schedule does not prove that a pump executes it; controller dispatch/acknowledgement is unfinished |
| Watering history | Inspect timestamp, duration, recorded volume, chamber, and batch | Supports traceability and water-use review | Calibrated physical flow measurements and a complete manual/device event-entry contract still need validation |
| Water-use chart and totals | Aggregate saved watering events in litres | Helps compare resource usage over time | Samples are synthetic; actual savings need measured baselines and calibrated flow |
| Maintenance notes | Record equipment inspections and service notes | Preserves context around faults and replacements | Notes do not certify calibration or electrical safety |
| Evidence records | Save calibration/irrigation/safety/offline checks with pending/pass/fail and notes | Separates observations from conclusions | Seeded inspections remain pending; no physical check is marked passed by seeding |
| Clickable five-star assessment | Select a batch star, review its preselected rating in the form, add comments, and Save | Removes an extra rating step while keeping an intentional submission | Clicking a star does not save a review; only an authorized evaluator may submit |
| Rating guide | Expand the compact 1 Poor to 5 Excellent guide | Keeps human assessments consistent | A rating is a human observation, not a device value or proof of food safety |
| Evaluation history | Review stars, comments, batch context, and submission time | Preserves independent human judgement | Corrections/deletion and evaluator qualification policies remain future work |
| Alerts and history | Review severity, source, related context, and recorded status | Keeps unresolved problems visible | Device faults create one active automatic alert and resolve on healthy recovery; operator reports are persisted and retried idempotently. A general threshold rule engine and external delivery remain future work |
| Notification preferences | Enable/disable supported in-app alert categories | Reduces irrelevant interruptions | Unread state is saved per user; reading does not resolve issues. Push/email delivery is not configured |

## Administration and outputs

| Feature | How it is used | Why it exists | Current limit |
| --- | --- | --- | --- |
| Superadmin overview | Review accounts, pending roles, chambers, alerts, and recent activity | Prioritizes administrative work rather than operator controls | Account API errors show “Unavailable”; an empty response remains genuinely empty |
| Account directory | Search/filter accounts and inspect assigned serials/evaluators | Centralizes governance | Uses persisted API responses; the former automatic static-account fallback is removed |
| Account editing | Correct supported details and roles, then save | Keeps access aligned with responsibilities | Errors remain visible; no in-memory edit is reported as persisted success |
| Application-profile deletion | Confirm a permitted deletion | Removes an unused application profile without obscuring consequences | Self/last-active-admin protection applies; linked history returns a conflict. Hosted Auth identity deletion/suspension is separate, and an enabled identity can create a new pending profile on later sign-in |
| Hardware serial grants | Select an operator and grant the printed chamber serial | Establishes responsibility for equipment | The dashboard action opens the working grant form; granting is not a sensor heartbeat |
| Audit log | Search recorded actions, targets, and times | Makes changes attributable and reviewable | Administrative maintenance still needs retention/export/incident-response policies |
| CSV export | Export the authorized filtered rows | Supports external analysis with units and provenance | CSV does not grant new access; formula-like text is escaped |
| Printable report/PDF | Open a branded report and use the browser print dialog | Produces readable assessment/telemetry evidence | It is a snapshot, not a signed certificate |
| Help and FAQ | Open the account menu and find role/workflow guidance | Gives users a recovery path | Current-situation reports save to Alerts; external support delivery remains unavailable |
| Android preview download | Download the locally built development APK | Allows native mobile review | Development signing, store release, iOS distribution, push, and device validation remain separate work |

For the independent Flutter application's Today, Batches, Alerts and Account
flows, see the [mobile experience guide](mobile-experience.md). It explains
field scanning, chamber checks, operator maintenance, evaluator assessments,
connection limits, the palette and the proposed mobile roadmap.
| Windows and Linux launchers | Start, stop, and inspect dependencies with `.bat` or `.sh` | Makes local development repeatable | Linux lifecycle tests require Linux; startup/migrations need the configured database/network |
| Saved demonstration records | Inspect `DEMO-SS-*` batches and sample chamber/history | Makes demonstrations informative without inventing live results | Explicitly seeded into one selected development account; never automatic on login |

## Proposed features and priorities

These are suggestions, not implemented integrations or promised deliveries.

| Priority | Proposed feature | Benefit and reason | Prerequisite / acceptance evidence |
| --- | --- | --- | --- |
| MVP | Complete tray assignment and per-tray history | Makes batch-to-physical-location traceability reliable | Ownership constraints, one-active-batch rule, and end-to-end UI tests |
| MVP | Manual/device watering event entry with calibrated units | Makes water totals explainable | Validation, source label, duplicate protection, calibrated meter comparison |
| MVP | Controller-local schedule execution and safety interlocks | Lets irrigation remain safe without internet | Reviewed firmware, wiring, timeouts, dry-run protection, emergency stop, isolated bench evidence |
| MVP | Acknowledged commands with expiry | Shows whether requested work actually occurred | Authorization, unique command IDs, acknowledgement, failure/retry and no-repeat tests |
| MVP | Offline event queue/replay | Prevents lost or duplicated records after outages | Durable device storage, power-loss and reconnect tests |
| MVP | Backup/restore and staging acceptance | Makes the system recoverable and releasable | Restored database, tested configuration, real-role UAT, documented release |
| Next | QR labels and scan-to-batch/chamber | Speeds up field identification | Locally generated labels, authenticated detail route, tested scanner fallback |
| Next | Suspend/reactivate accounts | Revokes access while preserving production history | Audited application status, hosted Auth/session revocation, self/last-admin protection and recovery policy |
| Next | Push notifications | Reaches an operator away from the dashboard | FCM/Web Push tokens, opt-in/opt-out, delivery retries, deduplicated incidents |
| Next | Photo evidence | Adds visual context to evaluator/maintenance notes | Private Storage bucket, RLS, file/type/size validation, retention rules |
| Next | Harvest weight, germination rate, and yield | Connects water use with actual output | Calibrated scales, seed/harvest weights, documented formulas and units |
| Next | Configurable alert thresholds | Adapts monitoring to validated operating limits | Hardware-approved limits and audited changes; no arbitrary browser safety overrides |
| Later | Weather context | Helps outdoor planning | Weather API/geolocation consent; never a substitute for indoor chamber sensors |
| Later | Multi-chamber comparison | Identifies recurring faults or efficiency differences | Comparable calibrated measurements and adequate history |
| Later | Predictive recommendations | Suggests maintenance or harvest checks | Sufficient labelled real data, evaluation, explainable uncertainty, human review |
| Later | Multi-site tenancy | Supports independent facilities | Strong tenant isolation, account management, reporting and access tests |

## Design references

The [Teras dashboard on Dribbble](https://dribbble.com/shots/27802059-Teras-Agriculture-Dashboard)
is a reference for prioritizing agricultural conditions and actions in one
workspace. SproutSync adapts the information hierarchy with its own green palette,
readable cards, attention panel, and concrete administrative actions; it does not
copy the artwork or introduce field-map controls without a working use case.
The requested star flow is implemented with accessible native radio inputs and a
comments form. Figma Community feedback-form references were searched, but the
specific page could not be inspected because access was blocked; no unreviewed
template or external code was imported.
