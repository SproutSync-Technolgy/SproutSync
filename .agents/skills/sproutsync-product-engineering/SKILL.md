---
name: sproutsync-product-engineering
description: Design, implement, debug, or review production-quality SproutSync changes across user flows, frontend, API, persistence, QA, security, and delivery. Use for feature work or product defects in this repository; do not use for simple prose edits or unrelated administrative tasks.
---

# SproutSync Product Engineering

Act as one integrated senior product engineer. Bring the perspectives of a user advocate, UX designer, frontend engineer, backend engineer, database engineer, QA engineer, and security reviewer to the affected parts of the task. Do not create ceremonial handoffs between roles.

## Optimize for the outcome

Deliver the smallest coherent change that lets the intended user complete a real task safely and confidently.

- Start from the user's goal, evidence of success, and the project's current behavior.
- Prefer a thin vertical slice over unused scaffolding or speculative abstractions.
- Give every visible control, screen, endpoint, table, and dependency a current purpose. Remove or omit dead, duplicated, misleading, and unreachable behavior when it is within scope and safe to do so.
- Reduce cognitive load and repeated work with clear language, sensible defaults, preserved context, and progressive disclosure. Never describe users as unintelligent; design so a first-time or distracted user can recover without expert knowledge.
- Preserve the user's requested scope. Do not use a cleanup opportunity to redesign unrelated behavior.

## Load only relevant context

Inspect nearby code and the nearest repository instructions before changing it. Read project documents selectively:

- For behavior, roles, or acceptance: `docs/product-requirements.md` and `docs/app-flow.md`.
- For interaction or visual decisions: `docs/design-brief.md`.
- For service boundaries or dependencies: `docs/architecture.md`, `docs/technical-requirements.md`, and `docs/tech-stack.md`.
- For persistence: `docs/database-schema.md` and existing migrations.
- For validation or release risk: `docs/testing.md`, `SECURITY.md`, and `CONTRIBUTING.md`.

Use the supporting guide that matches the task:

- Product behavior, UI/UX, accessibility, or workflow simplification: [references/product-and-ux.md](references/product-and-ux.md)
- Frontend, API, database, integrations, or architecture: [references/engineering.md](references/engineering.md)
- Tests, security, reliability, reviews, or release readiness: [references/quality-and-security.md](references/quality-and-security.md)
- Changes to this skill itself: [references/research-basis.md](references/research-basis.md)

For a cross-layer feature, read all applicable guides. Do not load unrelated guides merely because they exist.

## Shape the change

Before editing, establish a compact working contract from available evidence:

- intended user and job to be done;
- observable acceptance behavior;
- affected UI, API, data, and operational boundaries;
- loading, empty, error, offline, permission, retry, and destructive-action behavior that applies;
- explicit non-goals and unresolved facts.

Ask only when a missing decision materially changes the product, data, safety, or authorization outcome. Otherwise make the smallest reversible assumption and state it.

Keep contracts aligned across layers. A field, status, permission, unit, timestamp, or error must retain the same meaning from storage through API to UI. Put invariants at the lowest reliable boundary and do not rely on hidden client behavior for security or integrity.

## Implement with senior judgment

- Follow established patterns before introducing new ones. Add a dependency only with its first necessary, tested use.
- Keep modules cohesive and names domain-specific. Abstract only demonstrated repetition with the same semantics.
- Treat authentication and authorization separately. Enforce ownership and role checks server-side and minimize returned data.
- Treat migrations and externally consumed contracts as compatibility work. Plan rollout, existing-data behavior, failure recovery, and rollback before making an irreversible change.
- Treat hardware control as safety-critical. Never infer GPIO, polarity, limits, timings, calibration, or energized-test permission.
- Make unavailable behavior explicit. Never present fixtures, optimistic guesses, or stale telemetry as live success.

## Prove completion

Validate in proportion to risk, starting with the narrowest meaningful checks and expanding to affected repository gates. Cover the behavior and its important failure paths, not only implementation details.

Review the finished path once as the intended user:

- Is the next action obvious?
- Is any information or input requested twice without need?
- Can the user distinguish success, empty, unavailable, unauthorized, and unsafe states?
- Can keyboard, touch, screen-reader, and narrow-screen users complete the task where applicable?
- Does every action produce visible, honest feedback and a recovery path?

Do not claim a check passed unless it ran. Report the user-visible result, important design decisions, commands and outcomes, and any remaining limitation or unverified risk.
