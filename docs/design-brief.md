# Design Brief

## Product character

SproutSync should feel calm, trustworthy, and practical. Growers need quick
answers during routine work, not a dense control room. Administrators need
clear exceptions and traceability without exposing unsafe device controls.

## Visual direction

- Use the existing green palette to communicate healthy growth and conserve
  attention for warnings.
- Use warm amber for attention, red only for actionable danger, and blue for
  informational states.
- Use white cards, generous spacing, restrained shadows, and strong headings.
- Keep primary actions visible near the task they affect.
- Use familiar SVG icons with text labels; do not rely on emoji or glyph
  characters whose meaning changes across operating systems.
- Prefer a warm neutral canvas, one green action color, and low-contrast
  borders so the interface feels quiet while status colors remain meaningful.
- Use a compact left navigation for workspaces, a single clear page heading,
  and a small number of summary cards before operational lists.
- Treat the root URL as the grower entry point; keep `/admin` as the explicit
  administrative entry point and do not expose a redundant `/grower` route.

## Interaction rules

- Destructive actions require a confirmation modal and explain the consequence.
- Forms use labels, field-level validation, keyboard focus, and submit
  feedback.
- Tooltips explain unfamiliar icons but never replace visible labels for core
  actions.
- Toasts confirm completed actions; inline errors explain how to recover.
- Tables and lists provide search, filters, empty states, and predictable
  responsive behavior.
- Loading uses skeletons or clear progress text. Offline status is persistent
  while degraded.

## Product surfaces

The web workspace is the planning and oversight surface. Its primary navigation
uses five goal-based areas: Overview, Production, Alerts, Review, and System.
Related records belong inside those areas instead of appearing as separate
peer-level tabs.

The mobile app is a field companion, not a smaller copy of the web workspace.
Its primary jobs are to show today's priorities, scan a batch or chamber at the
point of work, capture a maintenance note or evaluation, and respond to an
alert. It can also open a current-situation draft at the point of work.
Historical reporting, evaluator access, and detailed planning
remain on the web.

## Role boundaries

- **Operator:** creates and updates production records, configures schedules,
  responds to alerts, records maintenance, and grants evaluator access. The
  operator does not rewrite device telemetry.
- **Evaluator:** independently reviews only shared batches and evidence and
  submits a separate human assessment. The evaluator cannot change production
  records, device readings, or safety settings.
- **Machine/controller:** produces timestamped readings and owns time-sensitive
  safety interlocks. UI users may annotate or challenge a reading, but the
  original machine record remains traceable.

When a human evaluation conflicts with machine evidence, show both sources,
record the disagreement in the evaluation comments, and request operator
follow-up. Never silently replace either source.

## Design system

- Use the shared green and neutral semantic palette. Reserve amber for
  attention, red for actionable danger, and blue for informational evidence.
- Use a small, named type scale with clear heading, body, label, and supporting
  text roles. Avoid one-off font sizes.
- Cards use the same border, radius, restrained elevation, and internal spacing.
- Use recognizable line icons with visible text labels for primary actions.
- Interactive targets are at least 44 px where practical and expose visible
  focus, disabled, loading, success, and error states.
- Long record lists use typable search, meaningful filters, and numbered
  pagination. Printable reports state their goal and rely on browser PDF
  pagination rather than presenting an unexplained data export.
- Hardware UI names capabilities such as water level, light, temperature,
  humidity, water flow, pump, room, trays, and local display. It does not assume
  one controller model or claim a reading before a sensor reports it.

## Primary screens

1. Landing: value proposition, prototype feature sections, sign-in CTA.
2. Sign-in: role context, Google action, loading/error state, return path.
3. Overview: role scope, tracking map, active batches, conditions and alerts.
4. Production: typable batch search, month/status filters, numbered pages,
   clickable stages, irrigation and watering history.
5. Alerts: batch context, current-situation/SOP draft, risk and response detail.
6. Review: printable report, evidence, rating rubric, evaluation filters and
   evaluation detail.
7. System: sensors and chamber equipment, serial numbers, maintenance, activity,
   Admin IT setup and evaluator access.
8. Settings: locked identity, verified-email constraint, contact details,
   notification preferences, support and the single sign-out action.

## Accessibility and responsive behavior

Use semantic headings and landmarks, visible `:focus-visible` styles, minimum
44 px touch targets, text alternatives for status icons, and color plus text
for severity. At narrow widths, navigation becomes horizontally scrollable,
metrics stack, and dialogs remain usable without horizontal scrolling.
