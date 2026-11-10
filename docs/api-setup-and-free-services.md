# API setup and free-service options

Reviewed against official provider pages on 10 November 2026. Free quotas and
eligibility can change. These are suitable options for the project's needs,
not a claim to list every free API on the internet. Suggested services are not
automatically connected or enabled by this change.

## Required connections

| Component | What to configure | Why / where |
| --- | --- | --- |
| Supabase database | `DATABASE_URL` with PostgreSQL/psycopg, same project as Auth | Backend persistence and Alembic; server only |
| Supabase Auth and public API | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, matching `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Verified identity, RLS-protected browser records and RPCs |
| Supabase Realtime | Publish the relevant telemetry/device tables and retain RLS | Authorized live updates; API polling also handles missed readings |
| Backend URL | `VITE_API_URL` for hosted frontend; local Vite proxy in development | Account, device, and recovery API requests must reach the actual backend |
| Browser origin | `FRONTEND_URL`, matching allowed Auth redirects | Correct CORS and login return paths |
| MQTT broker | `MQTT_ENABLED`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_STALE_SECONDS` | TLS broker connection from the persistent backend; credentials stay server-side |
| Firmware identity | Optional backend `DEVICE_ID`; actual registered serial/topic in the firmware and database | The API generates a separate client ID so it cannot disconnect the ESP32 by reusing its MQTT client ID |
| Google OAuth, if enabled | OAuth client ID/secret in Supabase's provider settings; consent/test users and callback | Optional sign-in provider. Do not put the client secret in `VITE_` variables |
| Email delivery | Supabase Auth sender/templates/SMTP; optional API `GOOGLE_SMTP_EMAIL`, `GOOGLE_APP_PASSWORD`, SMTP host/port | Hosted Auth email delivery and the API's SMTP routes are separate configurations |
| Privileged Auth email synchronization | Optional `SUPABASE_SERVICE_ROLE_KEY` on the backend only | Needed for supported administrative Auth email corrections; never a browser/mobile key |

Set credentials on the deployed backend as well as locally. An ignored local
`.env` does not configure a hosting provider. Restart the backend after changes.
Use [SETUP.md](../SETUP.md) for exact startup commands and prerequisites.

## Implemented HTTP API inventory

The generated OpenAPI schema at `/openapi.json` and Swagger UI at `/docs` are the
authoritative request/response definitions. The current primary routes are:

| Method and path | Use / permission |
| --- | --- |
| `GET /api/v1/health` | Public process liveness; does not prove database, email, or MQTT readiness |
| `GET /api/v1/auth/me` | Verify bearer identity and return current profile |
| `POST /api/v1/auth/profile` | Save the current account's supported details |
| `POST /api/v1/auth/verify/send` | Request configured API onboarding email verification |
| `POST /api/v1/auth/verify/confirm` | Confirm the verification code with retry/cooldown rules |
| `GET /api/v1/batches` | List records permitted for the authenticated role/owner/grant |
| `POST /api/v1/batches` | Operator batch creation |
| `PATCH /api/v1/batches/{batch_id}` | Authorized batch updates |
| `POST /api/v1/batches/{batch_id}/archive` | Archive an authorized batch |
| `GET /api/v1/devices/discover` | Local-network discovery for permitted device setup |
| `POST /api/v1/devices/nearby` | Validate and register a selected discovered identity |
| `POST /api/v1/devices/connect` | Bind/validate an owned device/topic and wait for evidence |
| `GET /api/v1/devices/live` | Authorized device state and raw-reading recovery |
| `GET /api/v1/superadmin/accounts` | Superadmin directory and serial/evaluator relationships |
| `PATCH /api/v1/superadmin/accounts/{user_id}` | Superadmin account correction/role management |
| `DELETE /api/v1/superadmin/accounts/{user_id}` | Permitted deletion; conflicts preserve production/history |
| `POST /api/v1/superadmin/device-grants` | Grant a printed chamber serial to an operator |
| `POST /api/v1/superadmin/assign-evaluator` | Authorized evaluator/operator assignment |
| `GET /api/v1/operator/evaluators` | Inspect the operator's assigned evaluators |
| `PATCH /api/v1/operator/evaluators/{evaluator_id}` | Correct a permitted evaluator's supported details |
| `GET /api/v1/operator/access-requests` | Inspect requests addressed to the operator |
| `POST /api/v1/operator/access-requests/{request_id}/approve` | Approve the addressed request |
| `POST /api/v1/operator/access-requests/{request_id}/decline` | Decline the addressed request |
| `POST /api/v1/access-requests` | Request access from a designated operator |

`GET /` and `/health` are liveness aliases. Some administrative routes also
have legacy aliases. Protected requests use `Authorization: Bearer <Supabase
access token>`, not a hardcoded admin credential.

The web client also calls Supabase `/auth/v1/`, `/rest/v1/`, RPCs such as
`ensure_profile`, `save_profile`, `initialize_workspace`, and Realtime channels.
Operational tables include batches, devices, trays, telemetry, schedules,
watering, alerts, evidence, evaluations, maintenance, activity and preferences.
Not every database operation has a separate FastAPI route. Treat RLS and RPC
permissions as part of the API contract. The MQTT ingestion worker is a broker
subscriber, not a public HTTP “write sensor reading” route.

## Free services that fit this system

| Service | Best use | Free provision / important limit | Setup and project fit |
| --- | --- | --- | --- |
| Supabase Free | Existing database, Auth, Storage and Realtime | 500 MB database, 1 GB Storage, 50,000 monthly active users; inactive free projects can pause | Already the project's data platform. Keep a telemetry storage budget and external backups. [Official pricing](https://supabase.com/pricing) |
| EMQX Serverless | Authenticated MQTT over TLS/WebSockets | 1 million connection minutes and 1 GB traffic/month; spend limit 0 stops service at the quota | Fits the existing broker. Configure per-device/topic authorization; check quotas before endurance tests. [Official free quota](https://docs.emqx.com/en/cloud/latest/faq/deploy.html#free-quota-for-serverless-deployments) |
| Firebase Cloud Messaging | Future mobile/browser push notifications | FCM itself is listed as no-cost; other Firebase products have separate billing | Optional. Requires a Firebase project, platform setup, permission/token storage and a trusted sender. No need to migrate the Supabase database. [Official pricing](https://firebase.google.com/pricing/) |
| Brevo Free | Transactional email/SMTP alternative | 300 sends/day, subject to account eligibility and sender setup | Can be considered for Supabase custom SMTP or a future server adapter; current API SMTP code is configured for its existing sender. Domain/account verification still applies. [Official limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) |
| Resend Free | Alternative transactional email API/SMTP | 3,000 emails/month and 100/day | Optional alternative to Brevo, not an additional required service. Verify sender/domain and integrate the selected transport. [Official pricing](https://resend.com/pricing) |
| Open-Meteo | Future outdoor weather context and forecasts | Free open-access is non-commercial: 10,000 calls/day, 300,000/month, with additional rate limits and no uptime guarantee | Optional for thesis/prototyping. Check the licence for commercial use, cache requests, and attribute data. Never use weather as indoor chamber telemetry. [Official pricing and terms](https://open-meteo.com/en/pricing) |
| Local camera/QR libraries | Batch/chamber identification | Local processing does not require a paid third-party API | Prefer a reviewed local scanner/generator to a public QR endpoint that receives private record URLs. Test camera permissions and manual-entry fallback |

Google OAuth is an identity provider, not a sensor or crop API. Use the
[official OAuth configuration](https://developers.google.com/identity/protocols/oauth2)
through Supabase; optional Google products such as Maps or AI have independent
pricing. Do not assume those products are included with sign-in.

SMS, WhatsApp, hosted generative AI and commercial maps are not required for the
MVP. Do not describe them as unlimited/free or add them merely to increase the
number of integrations.

## Hosting and the persistent MQTT worker

Use Vercel for the web frontend if the project meets its
[Hobby eligibility](https://vercel.com/docs/plans/hobby). Keep the FastAPI/MQTT
worker in a persistent process: a local Linux machine/Raspberry Pi or a suitable
VM. This is an inference from the architecture's continuously running subscriber,
not a promise that every free hosting service supports it.

[Render free web services](https://render.com/docs/free) are useful for previews
but spin down when idle; that interrupts a continuously running MQTT subscriber.
They should not be presented as an unattended 24/7 telemetry solution.
[Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) is a VM option to
evaluate, subject to account eligibility, regional capacity, current quotas and
reclamation rules. Neither free capacity nor physical uptime is guaranteed.

For the lowest-complexity demonstration, use the existing local backend with
Supabase and EMQX within their free quotas. For a deployed frontend, give it an
HTTPS backend endpoint and correct CORS/redirects; a visitor's `localhost` cannot
refer to your development computer. Keep LAN discovery on a local backend or
provide a separately designed cloud device-provisioning flow.

## Setup sequence

1. Configure one Supabase project, the five required values, migrations and RLS.
2. Enable the chosen Auth providers, callback allowlists and tested sender.
3. Configure authenticated MQTT/TLS and constrained device topics.
4. Run a persistent backend and point the frontend at its HTTPS API.
5. Prove one physical packet reaches the database and authorized UI, then test
   reconnect/replay and storage limits.
6. Add optional email delivery, push, photo evidence or weather only when the
   feature requires it. Record quotas, failure behavior and secret ownership.
