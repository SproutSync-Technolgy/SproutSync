# Application Flow

## 1. Visitor to workspace

```mermaid
flowchart TD
  A[Landing page] --> B{Choose workspace}
  B -->|Grower| C[Grower sign-in]
  B -->|Admin| D[Admin sign-in]
  C --> E[Google OAuth]
  D --> E
  E --> F{Session valid?}
  F -->|No| G[Show actionable error]
  F -->|Yes| H{Role allowed?}
  H -->|No| I[Permission denied]
  H -->|Yes| J[Workspace overview]
```

## 2. Operator batch flow

```mermaid
flowchart LR
  A[Overview] --> B[My batches]
  B --> C[Create batch modal]
  C --> D{Valid form?}
  D -->|No| C
  D -->|Yes| E[POST /api/v1/batches]
  E -->|Success| F[Batch appears in list]
  E -->|Error| G[Inline error + retry]
  F --> H[Batch details]
  H --> I[Update stage/status]
  H --> J[Archive batch]
```

## 3. Data request states

Every request follows:

```text
idle → loading → success
             ↘ empty
             ↘ error → retry
offline ───────────────────────┘
```

The interface must distinguish an empty account from an unavailable API and
must not display placeholder values as live measurements.

## 4. Future device flow

```text
Device boot → validate configuration → sample locally → validate event
  → queue if offline → publish → API validates → persist → acknowledge
  → dashboard refresh
```

Actuator commands follow the reverse path only after authorization, expiry,
idempotency, interlock, and emergency-stop rules are implemented.

## 5. Evaluation disagreement flow

```mermaid
flowchart TD
  A[Machine reading or operator evidence] --> B[Evaluator reviews shared record]
  B --> C{Human observation agrees?}
  C -->|Yes| D[Submit independent assessment]
  C -->|No| E[Document discrepancy and context]
  E --> F[Request operator recheck]
  F --> G[Record follow-up evidence]
  D --> H[Preserve original machine and human records]
  G --> H
```

An evaluation is a human judgment, not a correction to telemetry. The UI keeps
source, actor, and timestamp visible so a later review can explain why the
records differed.

## 6. Current-situation and SOP flow

```mermaid
flowchart LR
  A[Describe current situation] --> B[Specify chamber or component]
  B --> C[Link batch and equipment serial]
  C --> D[Classify risk]
  D --> E[Copy LCD or screen message]
  E --> F[Record safe action and escalate]
```

The UI includes this flow as a non-persisted draft until an incident contract,
owner, notification destination, and audit policy are implemented. It must not
claim that a report was submitted or that physical equipment was made safe.

## 7. Record tracking map

```mermaid
flowchart LR
  A[Batch and owner] --> B[Sensors and alerts]
  B --> C[Evidence and maintenance]
  C --> D[Independent evaluation]
  D --> E[Activity log]
```

Every detail view should preserve the batch, owner, source, and timestamp needed
to follow this path. Evaluators may receive records from multiple operators, so
operator context remains visible in batch and evaluation filters.

## 8. Identity correction and access setup

- A completed account name is read-only. A correction starts from the support
  entry point and is not silently changed in profile settings.
- Email changes remain disabled until verified change-email behavior exists.
- Admin IT registers equipment and provisions operators.
- Evaluator invitations require delivery and acceptance tracking before the UI
  can present them as available.
- The account menu is the single profile and sign-out destination on the web.

## 9. Open terminology

`CBA × 365` was included in panel notes but has no defined product meaning or
workflow. It must not appear as a UI label until the panel supplies its full
name, intended user, data, and expected action.
