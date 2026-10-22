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

## Primary screens

1. Landing: value proposition, prototype feature sections, sign-in CTA.
2. Sign-in: role context, Google action, loading/error state, return path.
3. Grower overview: active batches, next work, conditions, water use, alerts.
4. My batches: search, status filter, create modal, details and archive.
5. Admin overview: users, batches, alerts, read-only device state.
6. Settings: identity, units, environment, and sign-out.

## Accessibility and responsive behavior

Use semantic headings and landmarks, visible `:focus-visible` styles, minimum
44 px touch targets, text alternatives for status icons, and color plus text
for severity. At narrow widths, navigation becomes horizontally scrollable,
metrics stack, and dialogs remain usable without horizontal scrolling.
