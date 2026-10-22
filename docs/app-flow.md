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

## 2. Grower batch flow

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
