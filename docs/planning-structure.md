# SproutSync planning structure

This document explains how the team should plan, implement, review, and
release SproutSync without creating disconnected frontend, backend, and
firmware work.

## Work hierarchy

Use this hierarchy for GitHub issues and pull requests:

```text
Outcome
└── Milestone
    └── Vertical slice
        └── Task
            └── Test or acceptance evidence
```

### Outcome

An outcome is a user-visible result, such as “an operator can monitor an active
batch offline.”

### Milestone

A milestone groups related slices with a measurable exit condition. The MVP
milestones are defined in [`mvp.md`](./mvp.md).

### Vertical slice

A vertical slice changes the contracts, backend, database, and dashboard
together when the feature crosses those boundaries. Avoid building empty
layers for future features.

### Task

A task should be small enough to review and test independently. It must name
the files or module boundary it is expected to change.

### Evidence

Evidence is a test result, screenshot, migration run, firmware bench record,
backup restore, or UAT result. A task is not complete because code exists.

## Planned workstreams

| Workstream | Owns | First software output |
| --- | --- | --- |
| Product and UX | Requirements, screen inventory, acceptance cases | Approved MVP workflow |
| Contracts | API, MQTT, units, error shapes | Versioned schemas and examples |
| Backend | FastAPI routes, services, validation, auth | Tested MVP API |
| Database | Migrations, constraints, fixtures, backup | Reproducible PostgreSQL schema |
| Frontend | Dashboard routes, state, loading/error UX | Operator dashboard |
| Firmware/IoT | Telemetry, local schedule, interlocks, SD queue | Validated device event producer |
| Infrastructure | Compose, Raspberry Pi deployment, secrets, logs | Repeatable local deployment |
| QA and security | Test matrix, UAT, threat review, recovery | Release evidence |

## Dependency order

Work should normally progress in this order:

1. Confirm the user workflow, screen inventory, device identity, units, and
   hardware assumptions.
2. Write contracts and representative fixtures before consumers.
3. Add database migrations and constraints.
4. Add backend services and API tests.
5. Add dashboard states and operator actions.
6. Connect MQTT ingestion and replay tests.
7. Connect real firmware telemetry after bench validation.
8. Add alerts, exports, recovery tests, and UAT.

Authentication, database, and contracts are prerequisites for operational
screens. Hardware actuation is not a prerequisite for dashboard development and
must not block telemetry fixture work.

## Issue template structure

Every implementation issue should contain:

```markdown
## Outcome

What user-visible result will exist?

## Scope

Included files, routes, tables, messages, and screens.

## Non-goals

What must not be implemented in this issue?

## Dependencies

Issue numbers, contracts, hardware decisions, or migrations required first.

## Acceptance criteria

- [ ] ...

## Validation

Exact commands, test cases, screenshots, or bench evidence.

## Risks and rollback

Failure modes, migration rollback, feature flag, or safe disable path.
```

## Pull request structure

Pull requests should contain one vertical slice or one clearly isolated
foundation change. The repository pull request template is authoritative.
Every PR should identify:

- User outcome and linked issue
- API/database/contract changes
- Security and offline behavior
- Tests run with results
- Documentation updated
- Deployment or migration instructions
- Unresolved hardware assumptions

Do not combine authentication, firmware actuation, and unrelated UI redesign
in one PR.

## Definition of ready

A task is ready when:

- The user outcome is clear.
- Inputs, outputs, units, and errors are defined.
- Dependencies are linked.
- Acceptance criteria are measurable.
- Test data or hardware fixture requirements are known.
- The owner and reviewer are identified.
- Safety-sensitive behavior has a disable or rollback path.

## Definition of done

A task is done when:

- Implementation is complete and follows repository conventions.
- Tests cover success, invalid input, authorization, and failure behavior.
- Relevant documentation and contracts are updated.
- Local validation passes.
- The PR has review and acceptance evidence.
- Migrations, secrets, and deployment changes are explicitly documented.

## Progress tracking

Track progress by completed acceptance evidence, not by line count.

| Work level | Approximate software progress | Required evidence |
| --- | --- | --- |
| Foundation | 10% | Setup, CI, health check, architecture |
| MVP backend core | 25% | Auth, migrations, devices, batches |
| MVP operations | 40% | Telemetry, watering, alerts |
| MVP dashboard | 50% | Operator workflow works end-to-end |
| Reliability | 65% | Replay, recovery, backups, stale states |
| Hardware integration | 80% | Bench-tested firmware and interlocks |
| Production readiness | 100% | UAT, security, deployment, monitoring |

The percentages are planning indicators, not academic or production claims.
Update them only when the evidence for the associated level exists.

## Release gates

### Gate A — development

- Dashboard builds and typechecks.
- API tests and lint pass.
- Repository validation passes.
- No secrets are committed.

### Gate B — MVP candidate

- Fresh database migration succeeds.
- Core operator workflow passes.
- Invalid and duplicate telemetry is handled.
- Alerts and exports are traceable.
- Backup and restore are tested.

### Gate C — hardware pilot

- Board and GPIO map are approved.
- Pumps and valves remain isolated during initial tests.
- Maximum runtime and emergency stop behavior are verified.
- Offline queue and power-loss replay are tested.

### Gate D — production

- Authentication and device credentials are hardened.
- MQTT TLS and ACLs are enabled.
- Deployment recovery is documented.
- Security review and UAT are signed off.

## Immediate next tasks

1. Confirm the MVP screen flow and roles with the product owner.
2. Select the database migration approach and add the first migration.
3. Define shared batch, telemetry, watering, and alert contracts.
4. Add local authentication with test users only in development fixtures.
5. Implement devices, trays, and batches as the first end-to-end slice.
6. Add dashboard routing and API loading/error states.
7. Add telemetry fixtures before connecting physical sensors.

