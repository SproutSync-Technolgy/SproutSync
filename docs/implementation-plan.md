# Implementation Plan

## Delivery rule

Work is delivered as small vertical slices. Each slice updates the relevant
contract, migration, API, UI states, tests, and documentation in one focused
pull request linked to its GitHub sub-issue.

## Milestones

| Milestone | Outcome | Evidence |
| --- | --- | --- |
| M0 | Product and architecture agreed | PRD, technical requirements, flow, design, schema |
| M1 | Identity and platform foundation | OAuth/session tests, migration, CI |
| M2 | Batch operations | Batch CRUD, ownership tests, responsive UI |
| M3 | Operations | Watering, conditions, alerts, summaries |
| M4 | Admin and exports | Protected admin views, filters, CSV/API export |
| M5 | Mobile readiness | Flutter API client and grower screens |
| M6 | Release | Security, backup/restore, monitoring, UAT, handover |

## First 25% web slice

This slice is intentionally limited to M0–M2 foundations:

1. Publish the five product and engineering documents.
2. Add the `batches` table and migration.
3. Add protected batch list/create/update/archive API routes.
4. Add a grower batch list and create modal using real API responses.
5. Provide honest loading, empty, error, and preview fallback states.
6. Validate build, typecheck, Python compilation/lint, repository checks, and
   migration syntax where the local environment permits.

## Later slices

- S3/S4: complete schema and API contracts.
- S5: connect frontend session state and role enforcement.
- S6/S7: watering, conditions, alerts, admin APIs.
- S8: finish web screens and accessibility.
- S9: implement Flutter against stable contracts.
- S10: security, reliability, deployment, observability, and handover.

## PR checklist

- Link and close exactly one focused issue.
- Explain behavior and non-goals.
- Include migration/rollback notes.
- Include exact validation commands and results.
- Confirm no secrets, generated files, or hardware control were added.
