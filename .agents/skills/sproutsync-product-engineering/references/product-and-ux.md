# Product and UX guide

Use this guide when defining or changing a user journey, information architecture, screen, form, navigation, or interaction.

## Begin with the user's job

Name the user, the situation, the outcome they need, and the evidence that proves they achieved it. Prefer behavior that solves that job over feature parity with a prototype. Treat existing screenshots as design input, not proof that every visible element belongs in the product.

Design for a first-time, interrupted, time-constrained operator without making the interface childish. Use plain domain language, recognizable conventions, and a clear route back when something fails.

## Make the flow economical

- Give a screen one dominant purpose and make its primary action easy to find near the relevant content.
- Organize navigation around user goals, not database tables or internal service names.
- Avoid duplicate routes, repeated prompts, decorative metrics, and controls with no implemented outcome.
- Ask once for information the system already knows. Preserve valid input after an error and carry context forward when safe.
- Prefer a safe default plus an editable review step over repeated configuration. Never default a destructive, privileged, financial, or physical action.
- Use progressive disclosure for advanced choices. Keep routine work short without hiding consequential information.
- Consolidate genuinely equivalent actions, but keep distinct actions separate when permissions, consequences, or recovery differ.

When considering removal, first search for callers, deep links, permissions, analytics, tests, documentation, and accessibility dependencies. Remove the full path when safe; do not leave a dead button or orphaned route.

## Specify the interaction contract

For each user action, know:

| Concern | Question |
| --- | --- |
| Intent | What user goal does this action serve? |
| Preconditions | What data, role, connectivity, or state is required? |
| Feedback | What changes immediately and what is still pending? |
| Failure | Is the message specific, local, and actionable? |
| Recovery | Can the user retry, edit, cancel, undo, or safely return? |
| Consequence | Does confirmation explain an irreversible or high-impact result? |

Do not add confirmation to harmless routine actions. Prefer undo when a safe, reliable undo exists. Prevent accidental duplicate submissions while preserving an intentional retry path.

## Design every meaningful state

Data-backed surfaces should distinguish, when applicable:

- initial or idle;
- loading or refreshing;
- success with data;
- legitimate empty result with a useful next action;
- validation error;
- service or network error with recovery;
- offline or stale data with visible provenance;
- permission denied or unauthenticated;
- partial success or asynchronous processing.

Do not collapse empty, error, and unauthorized into the same blank screen. Do not show sample data as live data.

## Forms and content

- Use persistent visible labels, appropriate input types, examples only where they clarify format, and field-level help near the field.
- Validate syntax early but reserve authoritative business validation for the server. Focus the first invalid field and provide a useful error summary for longer forms.
- State units, time zone, date meaning, and destructive consequences explicitly.
- Use verbs that describe the result: “Archive batch” is clearer than “Submit.”
- Write success messages that confirm the completed result; write errors that say what happened and what the user can do next.

## Accessibility and responsive behavior

Target WCAG 2.2 AA as required by the product documentation.

- Start with semantic HTML, correct heading order, landmarks, native controls, programmatic names, and keyboard operation.
- Keep visible focus, sufficient contrast, non-color status cues, useful alternative text, and announcements for important dynamic changes.
- Keep targets usable for touch and do not make hover, fine pointer control, or horizontal scrolling essential.
- Reflow by priority on narrow screens; preserve meaning and action access rather than merely shrinking the desktop layout.
- Test the actual interaction with keyboard navigation and relevant automated checks. Automation does not establish full accessibility.

## User-centered review

Walk the happy path and at least one recovery path as each affected role. Count unnecessary decisions, repeated entries, context switches, and dead ends. Simplify when doing so preserves safety, traceability, and user control.

Authoritative foundations: [GOV.UK Government Design Principles](https://www.gov.uk/guidance/government-design-principles), [GOV.UK service-design introduction](https://www.gov.uk/service-manual/design/introduction-designing-government-services), and [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).
