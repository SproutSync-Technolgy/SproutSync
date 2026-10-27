# Quality, security, and delivery guide

Use this guide to plan or evaluate tests, review a change, harden a boundary, diagnose production risk, or prepare a release.

## Test from risk and behavior

Turn each acceptance behavior and important failure mode into the cheapest reliable evidence at the right boundary.

| Evidence | Best use |
| --- | --- |
| Unit or property test | Pure rules, transitions, calculations, parsing, and edge cases |
| Component test | Rendering, user interaction, focus, validation, and local state |
| API/integration test | Validation, authorization, transactions, persistence, and error contracts |
| Migration test | Upgrade against representative existing data and schema invariants |
| End-to-end test | A small number of critical user journeys across real boundaries |
| Manual or bench evidence | Accessibility judgment, visual behavior, hardware, calibration, and physical safety |

Cover applicable happy, boundary, invalid, unauthorized, duplicate, concurrent, timeout, offline, stale, and recovery cases. Avoid tests that only mirror implementation structure or assert mock call counts without proving behavior.

Prefer deterministic fixtures, isolated state, controllable time, and failure messages that identify the violated behavior. Never weaken a valid test solely to make a change pass.

Run focused checks while iterating, then the affected repository gates. Use the commands documented by the repository rather than inventing parallel workflows. If a check cannot run, record the exact blocker and do not report it as passing.

## Security review

Treat security as part of the feature contract, not a final scan.

- Identify assets, trust boundaries, actors, entry points, sensitive data, abuse cases, and the impact of failure.
- Enforce least privilege and deny by default. Test horizontal and vertical authorization, including direct object access.
- Validate input by type, size, range, format, and allowed state transition. Use parameterized database access and context-appropriate output encoding.
- Protect credentials, tokens, OAuth codes, personal data, audit data, and device credentials in storage, transit, logs, errors, fixtures, and exports.
- Apply CSRF, CORS, cookie, redirect, rate-limit, replay, and session controls according to the actual authentication and deployment model.
- Pin and review dependencies proportionally to exposure; avoid adding a package for trivial code.
- Keep audit events attributable and tamper-resistant enough for their purpose without logging secrets.

Use the [OWASP ASVS](https://asvs.owasp.org/) as a verification catalog for web application controls and [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) as lifecycle guidance. Apply relevant requirements; do not claim formal compliance from an informal review.

## Reliability and operations

- Define timeout, retry, backoff, idempotency, partial-failure, and recovery behavior at external boundaries.
- Make health, readiness, degraded operation, and stale information distinguishable.
- Prefer structured, correlatable logs and useful metrics while minimizing sensitive data. Make important failures diagnosable without reproducing them in production.
- Consider backup/restore, migration recovery, rollback or roll-forward, and compatibility before release.
- For devices, test network loss, power loss, duplicate replay, invalid sensor input, storage exhaustion, maximum runtime, interlocks, and emergency stop with documented bench conditions. Compilation is not safety evidence.

## Review and completion

Review changed behavior for correctness, regression, security, data integrity, accessibility, operability, and maintainability. Rank findings by user or system impact and cite concrete evidence.

A change is complete when its acceptance behavior works, relevant failure paths are handled, affected checks pass, contracts and migrations are synchronized, necessary documentation is updated, and remaining limitations are explicit. Do not equate code written with outcome delivered.
