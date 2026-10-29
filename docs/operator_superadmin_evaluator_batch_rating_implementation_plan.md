# SproutSync Implementation Plan: Account Management, Multi-Evaluator Assignment, 1-Click Gold Star Ratings & Operator-Unique Database Batches

**Target Environment:** Gemini 3.8 Antigravity (MCP Skill-Driven Execution)  
**Repository:** `SproutSync-josh`  
**Scope:** PostgreSQL / Supabase Migrations, FastAPI Backend (`backend/api`), React + TypeScript + Tailwind Dashboard (`frontend/dashboard`)

---

## 1. Executive Summary & Root-Cause Diagnosis

### 1.1 Current Issues Identified
1. **Disappearing Evaluator Bug on Account Assignment:**
   - **Root Cause:** In the current account management and workspace permission flow (`0004_workspace.sql`, `0011_superadmin_device_grants_rbac.sql`, `0012_role_hierarchy_access_requests.sql`, `backend/api/app/main.py`, and `frontend/dashboard/src/components/Workspace.tsx`), operator-to-evaluator mapping is treated as a single-value overwrite (`1:1` foreign key or single-slot replacement in state/upserts) rather than a persistent many-to-many (`M:N`) roster. Assigning a second Evaluator overwrites or filters out the previously assigned Evaluator.
   - **Required Fix:** Every Operator must be able to hold multiple assigned Evaluators simultaneously (`UNIQUE (operator_id, evaluator_id)`), and **all signed-in Evaluators must automatically be assigned to every Operator** so they can seamlessly evaluate any Operator's batches without displacing existing Evaluators.

2. **High-Friction Evaluator Rating UI:**
   - **Root Cause:** Evaluators currently have to open a secondary modal, drawer, or expansion panel to submit a batch rating.
   - **Required Fix:** Replace the modal-based rating trigger with a direct, review-site-style **1-click interactive 5-star rating bar** rendered inline on every batch card/row. Stars must be styled in metallic **gold** (`#FBBF24` / `#F59E0B`) with hover preview, keyboard accessibility, and instant optimistic persistence.

3. **Disconnected / Non-Unique Batch Data & "Demo" Labeling:**
   - **Root Cause:** Batch records either rely on shared frontend fixtures (`prototypeFixtures.ts` / `workspace.ts`) or generic seeded rows (`0009_database_demo.sql`) that expose "demo/sample" terminology and are not uniquely scoped per Operator with full CRUD persistence.
   - **Required Fix:** Connect all batch listings, evaluations, and CRUD actions (`Create`, `Read`, `Update`, `Delete`) directly to PostgreSQL/Supabase (`public.batches` and `public.batch_evaluations`). Deterministically seed **at least 5 unique, realistic cultivation batches per Operator** in the database. Remove **all** mentions of `"demo"`, `"sample"`, `"mock"`, or `"static"` from the UI, database payloads, and component copy.

---

## 2. Gemini 3.8 Antigravity MCP Server Skill Routing Matrix

Before executing each implementation phase, invoke the following local skills via the **Gemini 3.8 Antigravity MCP server**:

| Execution Layer | Antigravity MCP Skills to Reference | Primary Application in This Plan |
| :--- | :--- | :--- |
| **Database & Supabase** | `supabase`, `supabase-postgres-best-practices`, `postgres-best-practices`, `postgresql-optimization`, `database-migration`, `database-migrations-sql-migrations`, `database-security`, `saas-multi-tenant`, `production-audit`, `launch-check` | Designing `0015_operator_evaluator_batches_crud.sql`, composite unique constraints, auto-assignment triggers, deterministic per-operator 5-batch seeding, and RLS policies. |
| **Backend API & Security** | `fastapi-pro`, `fastapi-router-py`, `python-fastapi-development`, `pydantic-models-py`, `async-python-patterns`, `api-design-principles`, `api-patterns`, `api-and-interface-design`, `api-security-best-practices`, `backend-security-coder` | Refactoring account management endpoints, multi-evaluator assignment handlers, idempotent batch seeding on Operator/Evaluator sign-in, and 1-click rating `PUT`/`PATCH` endpoints. |
| **Frontend Architecture & Data** | `react-patterns`, `react-best-practices`, `react-state-management`, `react-component-performance`, `typescript-expert`, `typescript-advanced-types`, `zod-validation-expert`, `tanstack-query-expert`, `frontend-api-integration-patterns`, `frontend-data-contracts`, `frontend-optimistic-mutations` | Type-safe contracts in `src/data/workspace.ts`, optimistic 1-click star rating mutations, multi-evaluator roster state management, and real-time CRUD synchronization. |
| **UI, Design, Motion & A11y** | `frontend-design`, `build-ui`, `ui-states`, `ui-ux-pro-max`, `design-taste-frontend`, `dashboard-design`, `anti-ui-slop`, `anti-slop-design`, `tastegate`, `tailwind-patterns`, `tailwind-design-system`, `frontend-ui-dark-ts`, `ui-motion`, `fixing-motion-performance`, `fixing-accessibility`, `ui-a11y`, `wcag-audit-patterns`, `screen-reader-testing` | Crafting the inline Gold Star rating widget (`InlineGoldStarRating`), Superadmin/Operator Account Management roster cards, batch CRUD drawers/forms, zero-"demo"-slop copy, and WCAG 2.1 AA radiogroup keyboard support. |
| **Testing & Verification** | `pytest-skill`, `python-testing-patterns`, `playwright-skill`, `e2e-testing`, `webapp-testing`, `vitest-skill`, `browser-testing-with-devtools`, `ui-visual-validator` | Automated backend RBAC/assignment/CRUD tests (`pytest`) and end-to-end Playwright verification of multi-evaluator persistence and 1-click gold star ratings. |

---

## 3. Phase 1: Database Schema, Auto-Assignment Triggers & 5+ Unique Batches Seeding

> **MCP Skills Active:** `database-migrations-sql-migrations`, `supabase-postgres-best-practices`, `postgres-best-practices`, `database-security`, `saas-multi-tenant`

### 3.1 Migration File Creation
Create two synchronized migration files following the repository's Alembic + SQL convention:
- `backend/api/migrations/versions/0015_operator_evaluator_batches_crud.sql`
- `backend/api/migrations/versions/0015_operator_evaluator_batches_crud.py`

### 3.2 Multi-Evaluator Assignment Schema (`operator_evaluator_assignments`)
Fix the disappearing evaluator problem at the database level by ensuring an `M:N` mapping table with a composite uniqueness constraint rather than a single-column constraint on `operator_id`:

```sql
-- 1. Ensure operator_evaluator_assignments supports multiple Evaluators per Operator
CREATE TABLE IF NOT EXISTS public.operator_evaluator_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assignment_source TEXT NOT NULL DEFAULT 'auto_global' CHECK (assignment_source IN ('auto_global', 'superadmin', 'operator')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_operator_evaluator_pair UNIQUE (operator_id, evaluator_id)
);

-- Drop any legacy single-operator unique index if present from earlier migrations
DROP INDEX IF EXISTS idx_operator_single_evaluator;
ALTER TABLE public.operator_evaluator_assignments
    DROP CONSTRAINT IF EXISTS operator_evaluator_assignments_operator_id_key;

CREATE INDEX IF NOT EXISTS idx_oea_operator_id ON public.operator_evaluator_assignments(operator_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_oea_evaluator_id ON public.operator_evaluator_assignments(evaluator_id) WHERE is_active = TRUE;
```

### 3.3 Automatic Trigger: Every Signed-In Evaluator Assigned to All Operators
To satisfy *"assign every operator right now to have an evaluator, and for now all signed-in Evaluators go to Operator and ensure smooth addition without disappearing"*:

```sql
-- 2. Function to auto-link all Evaluators <-> all Operators idempotently
CREATE OR REPLACE FUNCTION public.sync_operator_evaluator_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If the profile is an Evaluator, assign them to all existing Operators
    IF NEW.role = 'evaluator' AND COALESCE(NEW.is_active, TRUE) = TRUE THEN
        INSERT INTO public.operator_evaluator_assignments (operator_id, evaluator_id, assignment_source, is_active)
        SELECT p.id, NEW.id, 'auto_global', TRUE
        FROM public.profiles p
        WHERE p.role = 'operator' AND p.id <> NEW.id
        ON CONFLICT (operator_id, evaluator_id)
        DO UPDATE SET is_active = TRUE, updated_at = NOW();
    END IF;

    -- If the profile is an Operator, assign all existing Evaluators to this Operator
    IF NEW.role = 'operator' AND COALESCE(NEW.is_active, TRUE) = TRUE THEN
        INSERT INTO public.operator_evaluator_assignments (operator_id, evaluator_id, assignment_source, is_active)
        SELECT NEW.id, p.id, 'auto_global', TRUE
        FROM public.profiles p
        WHERE p.role = 'evaluator' AND p.id <> NEW.id
        ON CONFLICT (operator_id, evaluator_id)
        DO UPDATE SET is_active = TRUE, updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_operator_evaluator_assignments ON public.profiles;
CREATE TRIGGER trg_sync_operator_evaluator_assignments
AFTER INSERT OR UPDATE OF role, is_active, last_sign_in_at ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_operator_evaluator_assignments();

-- Backfill all existing Operator <-> Evaluator pairs immediately
INSERT INTO public.operator_evaluator_assignments (operator_id, evaluator_id, assignment_source, is_active)
SELECT op.id, ev.id, 'auto_global', TRUE
FROM public.profiles op
CROSS JOIN public.profiles ev
WHERE op.role = 'operator'
  AND ev.role = 'evaluator'
  AND op.id <> ev.id
ON CONFLICT (operator_id, evaluator_id)
DO UPDATE SET is_active = TRUE, updated_at = NOW();
```

### 3.4 Batches & Inline Star Evaluations Schema (`batches` & `batch_evaluations`)
Upgrade `public.batches` and `public.batch_evaluations` so each Operator owns their unique batches and each Evaluator can click a star (`1..5`) directly:

```sql
-- 3. Ensure public.batches supports full CRUD and operator-unique records
ALTER TABLE public.batches
    ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS batch_code TEXT,
    ADD COLUMN IF NOT EXISTS cultivar TEXT NOT NULL DEFAULT 'Emerald Mung Sprout',
    ADD COLUMN IF NOT EXISTS chamber_name TEXT NOT NULL DEFAULT 'Chamber A-01',
    ADD COLUMN IF NOT EXISTS growth_stage TEXT NOT NULL DEFAULT 'Vegetative Flushing',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_review', 'completed', 'flagged', 'archived')),
    ADD COLUMN IF NOT EXISTS tray_count INTEGER NOT NULL DEFAULT 12 CHECK (tray_count > 0),
    ADD COLUMN IF NOT EXISTS target_temp_c NUMERIC(4,1) NOT NULL DEFAULT 22.5,
    ADD COLUMN IF NOT EXISTS target_humidity_pct NUMERIC(4,1) NOT NULL DEFAULT 78.0,
    ADD COLUMN IF NOT EXISTS yield_estimate_kg NUMERIC(6,2) NOT NULL DEFAULT 18.40,
    ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() - INTERVAL '4 days'),
    ADD COLUMN IF NOT EXISTS expected_harvest_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_operator_batch_code
    ON public.batches(operator_id, batch_code);

-- 4. Per-Evaluator Star Ratings Table (supports 1-click upsert per Evaluator per Batch)
CREATE TABLE IF NOT EXISTS public.batch_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT DEFAULT '',
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_batch_evaluator_rating UNIQUE (batch_id, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_evaluations_batch_id ON public.batch_evaluations(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_evaluations_evaluator_id ON public.batch_evaluations(evaluator_id);
```

### 3.5 Deterministic Seeding of At Least 5 Unique Batches Per Operator
Create a PostgreSQL function + trigger `public.ensure_operator_minimum_batches(p_operator_id UUID)` that guarantees every existing and newly created Operator has **at least 5 unique batches** with realistic, operator-specific batch codes, cultivars, chambers, and telemetry targets (with zero mention of "demo"):

```sql
CREATE OR REPLACE FUNCTION public.ensure_operator_minimum_batches(p_operator_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_count INTEGER;
    v_op_prefix TEXT;
    v_hash INT;
    v_idx INT;
    v_cultivars TEXT[] := ARRAY[
        ' Jade Mung Bean Select',
        'Crimson Radish Micro-Shoot',
        'Golden Alfalfa Crown',
        'Sunburst Broccoli Sprout',
        'Sweet Pea Tendril Prime',
        'Emerald Lentil Crisp',
        'Purple Kohlrabi Canopy',
        'Wasabi Mustard Vigour'
    ];
    v_stages TEXT[] := ARRAY[
        'Imbibition & Soak',
        'Radicle Emergence',
        'Hypocotyl Elongation',
        'Canopy Greening',
        'Pre-Harvest Conditioning'
    ];
    v_statuses TEXT[] := ARRAY['active', 'pending_review', 'active', 'completed', 'pending_review'];
BEGIN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.batches
    WHERE operator_id = p_operator_id AND status <> 'archived';

    IF v_existing_count >= 5 THEN
        RETURN;
    END IF;

    -- Derive a deterministic, unique 4-character alphanumeric prefix per operator UUID
    v_op_prefix := UPPER(SUBSTRING(REPLACE(p_operator_id::TEXT, '-', ''), 1, 4));
    v_hash := ABS(hashtext(p_operator_id::TEXT));

    FOR v_idx IN (v_existing_count + 1)..5 LOOP
        INSERT INTO public.batches (
            operator_id,
            batch_code,
            cultivar,
            chamber_name,
            growth_stage,
            status,
            tray_count,
            target_temp_c,
            target_humidity_pct,
            yield_estimate_kg,
            notes,
            started_at,
            expected_harvest_at
        ) VALUES (
            p_operator_id,
            FORMAT('BATCH-%s-%s', v_op_prefix, LPAD((100 + v_idx + (v_hash % 89))::TEXT, 3, '0')),
            TRIM(v_cultivars[((v_hash + v_idx) % ARRAY_LENGTH(v_cultivars, 1)) + 1]),
            FORMAT('Chamber %s-0%s', CHR(65 + ((v_hash + v_idx) % 4)), v_idx),
            v_stages[((v_idx - 1) % ARRAY_LENGTH(v_stages, 1)) + 1],
            v_statuses[((v_idx - 1) % ARRAY_LENGTH(v_statuses, 1)) + 1],
            10 + ((v_hash + v_idx * 3) % 18),
            ROUND((20.5 + ((v_hash + v_idx * 7) % 45) * 0.1)::NUMERIC, 1),
            ROUND((72.0 + ((v_hash + v_idx * 11) % 180) * 0.1)::NUMERIC, 1),
            ROUND((14.0 + ((v_hash + v_idx * 13) % 160) * 0.1)::NUMERIC, 2),
            FORMAT('Automated environmental profile calibrated for Zone %sbay-%s.', v_op_prefix, v_idx),
            NOW() - ((7 - v_idx) || ' days')::INTERVAL,
            NOW() + ((v_idx + 1) || ' days')::INTERVAL
        )
        ON CONFLICT (operator_id, batch_code) DO NOTHING;
    END LOOP;
END;
$$;
```

---

## 4. Phase 2: FastAPI Backend Refactoring (`backend/api/app/`)

> **MCP Skills Active:** `fastapi-pro`, `fastapi-router-py`, `pydantic-models-py`, `api-design-principles`, `api-security-best-practices`, `backend-security-coder`

### 4.1 Pydantic Data Contracts (`backend/api/app/models.py`)
Update and add strict Pydantic v2 models in `backend/api/app/models.py`:

1. **`EvaluatorAssignmentSummary`**:
   - `assignment_id: UUID`
   - `evaluator_id: UUID`
   - `full_name: str`
   - `email: str`
   - `assignment_source: Literal["auto_global", "superadmin", "operator"]`
   - `assigned_at: datetime`

2. **`OperatorAccountView`**:
   - `operator_id: UUID`
   - `full_name: str`
   - `email: str`
   - `role: str`
   - `is_active: bool`
   - `assigned_evaluators: list[EvaluatorAssignmentSummary]` *(Fixes single-evaluator overwrite)*
   - `batch_count: int`

3. **`BatchEvaluationInput` (1-Click Star Rating Payload)**:
   - `rating: int = Field(..., ge=1, le=5, description="1 to 5 gold star rating")`
   - `comment: Optional[str] = Field(default=None, max_length=500)`

4. **`BatchCreateRequest` & `BatchUpdateRequest` (Full CRUD)**:
   - `operator_id: Optional[UUID]` (Superadmin can specify any operator; Operator defaults to `current_user.id`)
   - `batch_code: Optional[str]`
   - `cultivar: str = Field(..., min_length=2, max_length=120)`
   - `chamber_name: str = Field(..., min_length=2, max_length=80)`
   - `growth_stage: str`
   - `status: Literal["active", "pending_review", "completed", "flagged", "archived"]`
   - `tray_count: int = Field(default=12, ge=1, le=500)`
   - `target_temp_c: float = Field(default=22.5, ge=10.0, le=40.0)`
   - `target_humidity_pct: float = Field(default=78.0, ge=30.0, le=99.0)`
   - `yield_estimate_kg: float = Field(default=18.0, ge=0.1, le=5000.0)`
   - `notes: str = Field(default="", max_length=1000)`

5. **`BatchRecordResponse`**:
   - Includes all batch fields plus:
   - `operator_name: str`
   - `operator_email: str`
   - `my_rating: Optional[int]` *(The signed-in Evaluator's clicked star rating, `1..5`)*
   - `average_rating: Optional[float]` *(Aggregate gold star average across all assigned Evaluators)*
   - `rating_count: int`
   - `evaluations: list[BatchEvaluationDetail]`

### 4.2 Account Management & Evaluator Assignment Endpoints (`backend/api/app/main.py`)
Refactor the workspace account management routes so adding an Evaluator **never** removes existing Evaluators:

1. **Idempotent Sync Hook on Session / Workspace Bootstrap (`GET /api/v1/workspace/bootstrap` & `/api/v1/accounts/hierarchy`)**:
   - Whenever an Evaluator or Operator authenticates, execute:
     - `SELECT public.sync_all_evaluators_to_operators();`
     - For every active Operator, execute `SELECT public.ensure_operator_minimum_batches(operator_id);`
   - This guarantees that:
     - Any newly signed-in Evaluator is immediately linked to all Operators.
     - Every Operator always has at least 5 unique batches in the database.

2. **`POST /api/v1/accounts/operators/{operator_id}/evaluators` (Add Evaluator to Operator)**:
   - **Accessible by:** `superadmin` and `operator` (for their own `operator_id`).
   - **Behavior:** Inserts `(operator_id, evaluator_id)` using `ON CONFLICT (operator_id, evaluator_id) DO UPDATE SET is_active = TRUE, updated_at = NOW()`.
   - **Crucial Fix:** Remove any `DELETE FROM operator_evaluator_assignments WHERE operator_id = $1` or single-column `profiles.assigned_evaluator_id = $2` overwrite logic. Return the complete updated `assigned_evaluators` array.

3. **`DELETE /api/v1/accounts/operators/{operator_id}/evaluators/{evaluator_id}` (Unassign Specific Evaluator)**:
   - **Accessible by:** `superadmin` and `operator`.
   - **Behavior:** Soft-deactivates (`is_active = FALSE`) or deletes only that specific `(operator_id, evaluator_id)` pair while leaving all other Evaluators on that Operator intact, and enforcing a guard if the Operator would be left with 0 Evaluators (unless overridden by Superadmin).

4. **`PATCH /api/v1/accounts/users/{user_id}/role` (Role Promotion/Demotion)**:
   - **Accessible by:** `superadmin`.
   - **Behavior:** When a user's role is updated to `evaluator`, automatically insert assignments for all active Operators (`ON CONFLICT DO NOTHING`) so existing Evaluators never disappear. When updated to `operator`, automatically seed their 5 unique batches via `ensure_operator_minimum_batches(user_id)` and link all active Evaluators.

### 4.3 Batches CRUD & 1-Click Star Rating Endpoints (`backend/api/app/main.py`)
Implement clean REST endpoints for database-backed batches:

| Method & Route | Allowed Roles | Description |
| :--- | :--- | :--- |
| `GET /api/v1/batches` | `operator`, `evaluator`, `superadmin` | Returns database batches. **Operators** see their own 5+ unique batches. **Evaluators** see batches for all Operators assigned to them (which defaults to all Operators), grouped/filterable by Operator. **Superadmins** see all Operators' batches. |
| `POST /api/v1/batches` | `operator`, `superadmin` | Creates a new batch in `public.batches` for the Operator with auto-generated operator-unique `batch_code` if omitted. |
| `PATCH /api/v1/batches/{batch_id}` | `operator` (own), `superadmin` | Updates cultivar, chamber, growth stage, tray count, environmental targets, status, or notes. |
| `DELETE /api/v1/batches/{batch_id}` | `operator` (own), `superadmin` | Deletes or archives a batch record (and if an Operator drops below 5 batches, allows optional re-seeding or manual creation). |
| `PUT /api/v1/batches/{batch_id}/rating` | `evaluator`, `superadmin` | **1-Click Star Rating Endpoint.** Accepts `{ "rating": 1..5 }`. Upserts into `public.batch_evaluations` on `(batch_id, evaluator_id)` and returns the updated `my_rating`, `average_rating`, and `rating_count` in `< 50ms`. |

---

## 5. Phase 3: Frontend UI & State Architecture (`frontend/dashboard/src/`)

> **MCP Skills Active:** `react-patterns`, `react-state-management`, `tanstack-query-expert`, `frontend-optimistic-mutations`, `tailwind-patterns`, `frontend-ui-dark-ts`, `anti-ui-slop`, `ui-motion`, `fixing-accessibility`, `wcag-audit-patterns`

### 5.1 Data Contracts & API Client (`frontend/dashboard/src/data/workspace.ts`)
Update `frontend/dashboard/src/data/workspace.ts`:
- Replace any static/in-memory fallback arrays that use "demo" or shared generic batches with live API calls to `/api/v1/batches`, `/api/v1/batches/{id}/rating`, and `/api/v1/accounts/operators/{id}/evaluators`.
- If offline/fallback fixtures are ever needed for unit tests (`prototypeFixtures.ts`), generate them deterministically per `operatorId` (minimum 5 unique batches per operator) and strip all `"demo"` / `"sample"` strings.
- Add TypeScript interfaces:
  ```ts
  export interface EvaluatorAssignment {
    assignmentId: string;
    evaluatorId: string;
    fullName: string;
    email: string;
    assignmentSource: 'auto_global' | 'superadmin' | 'operator';
    assignedAt: string;
  }

  export interface BatchRecord {
    id: string;
    operatorId: string;
    operatorName: string;
    operatorEmail: string;
    batchCode: string;
    cultivar: string;
    chamberName: string;
    growthStage: string;
    status: 'active' | 'pending_review' | 'completed' | 'flagged' | 'archived';
    trayCount: number;
    targetTempC: number;
    targetHumidityPct: number;
    yieldEstimateKg: number;
    notes: string;
    startedAt: string;
    expectedHarvestAt: string;
    myRating: number | null;
    averageRating: number | null;
    ratingCount: number;
  }
  ```

### 5.2 Account Management UI Fix for Superadmin & Operator (`Workspace.tsx`)
In `frontend/dashboard/src/components/Workspace.tsx`:
1. **Multi-Evaluator Roster Chips (No Disappearing Evaluators):**
   - In the **Superadmin Account Management** table/cards and the **Operator Account Settings / Team Panel**, render an **Assigned Evaluators Roster** showing all Evaluators linked to each Operator as pill badges (`EvaluatorName • email`).
   - When the Superadmin or Operator selects an Evaluator from the **"Assign Evaluator"** selector and clicks **Add**:
     - Perform an optimistic append (`[...operator.assignedEvaluators, newEvaluator]`) deduplicated by `evaluatorId`.
     - Call `POST /api/v1/accounts/operators/${operatorId}/evaluators`.
     - Never overwrite the array with `[newEvaluator]`.
   - Display a clear status indicator: `"All active Evaluators are automatically linked to Operator accounts"` along with an `"Assign Additional Evaluator"` action and individual `"×"` unlink buttons (with confirmation) per badge.

### 5.3 Inline 1-Click Gold Star Rating Component (`InlineGoldStarRating`)
Create a dedicated, accessible component (either inside `Workspace.tsx` or `ProtoPrimitives.tsx`) for the Evaluator rating experience:
- **Zero Modal / Zero Drawer Requirement:**
  - Remove the `"Open Evaluation Modal"` / `"Rate Batch..."` dialog workflow as the primary rating mechanism.
  - Render 5 interactive star buttons directly inside each batch row/card.
- **Gold Visual Specification (`frontend-ui-dark-ts` & `design-token-contrast`):**
  - **Filled / Hovered Star Color:** Rich metallic gold `#FBBF24` (`amber-400` / `#FFD700`) with border stroke `#F59E0B` (`amber-500`) and subtle warm luminance `drop-shadow(0 0 6px rgba(251, 191, 36, 0.45))`.
  - **Unfilled Star Color:** High-contrast muted slate `rgba(148, 163, 184, 0.35)` with hover border preview.
- **Interaction & Optimistic Mutation (`frontend-optimistic-mutations` & `ui-motion`):**
  - `onMouseEnter(starValue)` highlights stars `1` through `starValue` in gold immediately.
  - `onClick(starValue)` immediately updates `batch.myRating = starValue` and recalculates `batch.averageRating` optimistically in React state, triggers a subtle scale pop (`transform: scale(1.15)` for `150ms`), and fires `PUT /api/v1/batches/${batch.id}/rating` in the background.
  - Show a compact inline status pill next to the gold stars: e.g., `4.8 ★ (3) • Your rating: 5★` (with an instant `"Saved"` micro-indicator on click).
- **Accessibility (`wcag-audit-patterns` & `fixing-accessibility`):**
  - Wrap the 5 stars in `role="radiogroup"` with `aria-label={`Rate batch ${batch.batchCode}`}`.
  - Each star button uses `role="radio"`, `aria-checked={currentRating === star}`, `aria-label={`${star} out of 5 stars`}`, and supports Left/Right arrow key navigation.

### 5.4 Operator-Unique Batches View & Full CRUD Operations (`Workspace.tsx` & `ProtoGrowerDashboard.tsx`)
1. **Operator View:**
   - Displays the Operator's own database-backed batches (guaranteed $\ge 5$ unique batches on first load).
   - Provides full inline/drawer **CRUD controls**:
     - **Create Batch (`+ New Batch`):** Form to add a new batch (Cultivar, Chamber, Growth Stage, Trays, Target Temp/Humidity, Yield Estimate, Notes) saved directly to `public.batches`.
     - **Read / Filter Batches:** Filter by status (`All`, `Active`, `Pending Review`, `Completed`, `Flagged`) and search by `batchCode` or `cultivar`.
     - **Update Batch (`Edit`):** Inline or slide-over editor to modify batch parameters, stage, or status.
     - **Delete Batch (`Delete`):** Confirmation action calling `DELETE /api/v1/batches/{batch_id}`.
   - Shows the live **Gold Star Rating** summary received from Evaluators on each batch card.
2. **Evaluator View:**
   - Displays all batches across their assigned Operators (with an **Operator Filter Tab/Dropdown** so the Evaluator can view all Operators or focus on a specific Operator's 5+ unique batches).
   - Every batch row features the **1-Click Gold Star Rating** control (`InlineGoldStarRating`) right on the card—one click rates the batch immediately.
3. **Superadmin View:**
   - Full visibility across all Operators, their assigned Evaluators roster, and all Operator-unique batches, with full CRUD and rating capabilities.
4. **Strict Removal of "Demo" Terminology (`anti-ui-slop`):**
   - Audit and remove every occurrence of `"Demo"`, `"demo purposes"`, `"Sample Data"`, `"Mock"`, or `"Static Preview"` in `Workspace.tsx`, `ProtoGrowerDashboard.tsx`, `ProtoLanding.tsx`, `workspace.ts`, and `workspace.css`.

---

## 6. Step-by-Step Execution Checklist

### Step 1: Database Migration & Seeding
- [ ] **1.1** Create `backend/api/migrations/versions/0015_operator_evaluator_batches_crud.sql` and `0015_operator_evaluator_batches_crud.py`.
- [ ] **1.2** Define `public.operator_evaluator_assignments` with `UNIQUE (operator_id, evaluator_id)` and drop any single-evaluator constraint.
- [ ] **1.3** Add trigger `trg_sync_operator_evaluator_assignments` to auto-assign all Evaluators to all Operators upon creation/sign-in/role change, and backfill existing accounts.
- [ ] **1.4** Define `public.batch_evaluations` with `UNIQUE (batch_id, evaluator_id)` and `rating CHECK (rating BETWEEN 1 AND 5)`.
- [ ] **1.5** Create `public.ensure_operator_minimum_batches(operator_id)` and seed at least 5 unique batches for every existing Operator in `public.profiles`.

### Step 2: Backend FastAPI Implementation
- [ ] **2.1** Update `backend/api/app/models.py` with `EvaluatorAssignmentSummary`, `BatchCreateRequest`, `BatchUpdateRequest`, `BatchEvaluationInput`, and `BatchRecordResponse`.
- [ ] **2.2** Update account management endpoints in `backend/api/app/main.py` so adding an Evaluator appends to `operator_evaluator_assignments` without removing existing Evaluators.
- [ ] **2.3** Implement `/api/v1/batches` (`GET`, `POST`), `/api/v1/batches/{batch_id}` (`PATCH`, `DELETE`), and `/api/v1/batches/{batch_id}/rating` (`PUT`).
- [ ] **2.4** Hook `ensure_operator_minimum_batches` and `sync_operator_evaluator_assignments` into the workspace bootstrap/profile initialization flow.

### Step 3: Frontend UI, Gold Star Rating & CRUD Integration
- [ ] **3.1** Update `frontend/dashboard/src/data/workspace.ts` with typed API methods for batch CRUD, 1-click rating (`rateBatch`), and multi-evaluator assignment (`assignEvaluatorToOperator`, `removeEvaluatorFromOperator`).
- [ ] **3.2** Build `InlineGoldStarRating` in `frontend/dashboard/src/components/Workspace.tsx` (and `frontend/dashboard/src/workspace.css`) with `#FBBF24` / `#F59E0B` gold styling, hover preview, and 1-click optimistic save.
- [ ] **3.3** Update the Evaluator batch table/cards so clicking a gold star immediately saves the rating without opening any modal or secondary dialog.
- [ ] **3.4** Update the Operator & Superadmin Account Management UI to display the full list of assigned Evaluators per Operator and support smooth addition/removal without any Evaluator disappearing.
- [ ] **3.5** Wire the Operator & Superadmin Batch CRUD forms (Create, Edit, Delete) to the database endpoints and scrub all `"demo"` terminology from the UI.

---

## 7. Verification & Testing Plan

> **MCP Skills Active:** `pytest-skill`, `python-testing-patterns`, `playwright-skill`, `e2e-testing`, `vitest-skill`, `production-audit`, `launch-check`

### 7.1 Backend Automated Tests (`backend/api/tests/test_workspace_permissions.py`)
1. **`test_multiple_evaluators_assigned_without_overwrite`**:
   - Create Operator $O_1$ and Evaluators $E_1, E_2, E_3$.
   - Verify $E_1, E_2, E_3$ are all assigned to $O_1$ simultaneously and adding $E_3$ does not remove $E_1$ or $E_2$.
2. **`test_each_operator_has_at_least_five_unique_batches`**:
   - Create Operators $O_1$ and $O_2$.
   - Call `GET /api/v1/batches` for $O_1$ and $O_2$.
   - Assert `len(batches_o1) >= 5` and `len(batches_o2) >= 5`, and assert that ` {b.batch_code for b in batches_o1}.isdisjoint({b.batch_code for b in batches_o2}) `.
3. **`test_batch_crud_and_one_click_star_rating`**:
   - Operator creates a 6th batch (`POST /api/v1/batches`), updates its `growth_stage` (`PATCH`), Evaluator rates it `5` stars (`PUT /api/v1/batches/{id}/rating`), updates rating to `4` stars, and Operator deletes the test batch (`DELETE`).

### 7.2 Frontend E2E Playwright Tests (`frontend/dashboard/tests/workspace.spec.ts`)
1. **Multi-Evaluator Persistence Test:**
   - Sign in as Superadmin/Operator, add a second Evaluator to an Operator, and assert both Evaluator badges remain visible in the DOM.
2. **1-Click Gold Star Rating Test:**
   - Sign in as Evaluator, locate a batch row, click the 4th gold star button directly (`[role="radiogroup"] button[aria-label="4 out of 5 stars"]`), assert no modal opens, assert the 1st–4th stars have gold fill (`#FBBF24` / `rgb(251, 191, 36)`), and verify the rating persists across page reload.
3. **Zero "Demo" Text Audit:**
   - Assert `expect(await page.locator('body').innerText()).not.toMatch(/\bdemo\b/i)`.