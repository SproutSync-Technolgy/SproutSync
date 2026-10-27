# Engineering guide

Use this guide for frontend, API, database, integration, or architectural work. Preserve the repository's documented React/TypeScript, FastAPI/Pydantic/SQLAlchemy/Alembic, PostgreSQL, and future ESP32/Flutter boundaries.

## Build a vertical contract

Define the observable behavior before distributing code across layers:

- request, response, and error shapes;
- identity, role, ownership, and data exposure;
- domain states, transitions, invariants, units, and timestamps;
- retry, idempotency, concurrency, offline, and stale-data behavior;
- compatibility and migration expectations;
- telemetry, logging, and audit needs without secret or personal-data leakage.

Keep one meaning for each concept. Do not let the UI, API, and database invent different status names or optionality. Reuse or update shared contracts when they exist.

## Frontend

- Model the user flow explicitly instead of scattering booleans that permit impossible states.
- Keep server state, form state, navigation state, and purely visual state distinct.
- Prefer semantic elements and small domain components. Extract a component or hook when it owns a coherent responsibility or repeated behavior, not merely to reduce line count.
- Keep side effects at integration boundaries, clean them up, and guard against stale or out-of-order responses.
- Disable or deduplicate pending mutations where double submission is unsafe. Reconcile optimistic updates with the server and provide rollback or correction on failure.
- Render honest loading, empty, error, offline, unauthorized, stale, and partial states. Preserve the user's safe input across recoverable errors.
- Use types to make invalid states harder to represent. Do not replace runtime validation at network or storage boundaries with TypeScript assertions.
- Check keyboard flow, focus after dialogs or navigation, responsive reflow, and accessible names as part of the component behavior.

## Backend and API

- Validate and normalize untrusted input at the boundary, then apply domain rules in a testable service or domain operation when complexity warrants it.
- Authenticate the caller, authorize the specific action and resource, and scope every query accordingly. Client-side hiding is not authorization.
- Use consistent status codes and stable error semantics. Do not expose stack traces, SQL details, secrets, or whether inaccessible resources exist when that leaks information.
- Bound lists with stable ordering and defined pagination/filter semantics. Avoid unbounded reads and N+1 query patterns.
- Make retryable mutations idempotent or explicitly reject duplicates. Define transaction boundaries around the domain invariant, not arbitrary repository calls.
- Keep external I/O timeouts and failure behavior explicit. Avoid holding database transactions open across slow network calls.
- Keep OpenAPI aligned with implemented behavior and avoid breaking clients accidentally.

## Database

- Put durable integrity in PostgreSQL with appropriate primary keys, foreign keys, uniqueness, checks, nullability, and transaction boundaries. Mirror rules in the application for helpful feedback, not as the sole protection.
- Design indexes from real access paths and ordering. Check selectivity and write cost; an index on every column is not a strategy.
- Use timezone-aware UTC timestamps for stored events and keep occurrence time separate from receipt time when source delay matters.
- Preserve immutable history for auditable operational transitions rather than overwriting the only evidence.
- Consider concurrent writers, retries, lost updates, duplicate events, deletion behavior, and tenant/owner isolation.
- Make migrations deterministic and reviewable. Define existing-row backfill, lock and runtime impact, application compatibility during rollout, downgrade or forward-recovery strategy, and verification queries.
- Prefer expand/backfill/switch/contract for risky or deployed schema changes. Never edit an applied migration merely to make local history look cleaner.

## Architecture and dependencies

- Keep browser and mobile clients behind the HTTP API; they do not connect directly to PostgreSQL, MQTT, or hardware.
- Keep time-sensitive interlocks and safe local automation on the device. Cloud or UI availability must not be a prerequisite for physical safety.
- Introduce a layer, queue, cache, realtime channel, or dependency only for a demonstrated requirement. Record its failure, security, upgrade, and offline behavior.
- Prefer cohesive modules around domain capabilities over empty “future” folders or premature generic frameworks.
- Keep configuration outside code, secrets out of logs and version control, and development-only shortcuts visibly bounded from production.

## Maintainable implementation

Follow local naming, formatting, and error patterns. Remove duplication when the repeated code has the same reason to change; tolerate small repetition when abstractions would couple distinct concepts. Comments should explain constraints or decisions that code cannot make obvious.
