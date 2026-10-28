# SproutSync QA RBAC, Device Serial Grants & UI Simplification Agile Plan (`SproutSync-Amaro`)

> **Target Execution Environment:** Antigravity IDE (`gemini-3.8` / `gemini-flash-3.8`) + `aas-skills-mcp` (AAS Skill MCP Server)
> **Project Root Plan Slug:** `sproutsync-qa-rbac-ui-redesign-plan.md`
> **Methodology:** Agile Scrum (4 Focused Sprints · Atomic 2–5 Minute Tasks · Test-Driven RLS & Accessibility Gates)
> **Core Planning Skills Applied:** `@brainstorming` (Understanding Lock, NFRs, Decision Log) · `@concise-planning` (Scope & Atomic Action Items) · `@plan-writing` (Task-to-Verification Mapping)

## 1. Executive Goal & High-Level Approach (`@concise-planning` + `@plan-writing`)

**Goal:** Enforce strict four-tier Role-Based & Grant-Based Access Control (**Superadmin**, **Operator**, **Evaluator**, and **No-Grant User**) across PostgreSQL Row-Level Security (RLS), FastAPI, and React so **Superadmin** manages all accounts (names, emails, roles) and grants **Device Serial IDs** to Operators, **Operators** grant chamber/batch access to **Evaluators**, and **No-Grant users** are blocked from all production/demo records—while simplifying `Workspace.tsx` with role-specific tabs (`Readings` replacing `Review` with detailed 6-sensor telemetry cards), clickable role-tailored `Overview` KPI cards and quality distribution charts, a **single newest-first paginated Batches table** with inline **star ratings**, a **compact search/dropdown/calendar-icon datepicker toolbar**, and an accessible **Notebook-with-Magnifying-Glass** in-depth batch inspection action.

**High-Level Approach:**
1. **Sprint 1 — Access Matrix, Multi-Tenant RLS & Audit Logging (`0011_superadmin_device_grants_rbac.sql` + FastAPI):** Upgrade the database schema and RLS policies in `backend/api/migrations/versions/0011_superadmin_device_grants_rbac.py` (`.sql`) and `backend/api/app/main.py` to introduce the `superadmin` role, create `public.device_grants` (mapping `serial_number` / `device_id` from Superadmin to Operator), scope `public.evaluator_access` so Evaluators only see batches/readings from Operators who explicitly granted them access, remove the `sproutsync-demo-workspace` fallback in `public.can_view_owner(target)` so ungranted users see zero records, and log all role/account/serial/evaluator grants in `public.activity_logs`.
2. **Sprint 2 — Role-Specific Site Architecture, Clickable Overview KPIs & Quality Grade Charts (`Workspace.tsx` + `ProtoCharts.tsx`):** Replace generic navigation with role-unique tab sets (preserving `Alerts` across roles, renaming `Review` to `Readings`), make every `Overview` KPI card and `"How a record is tracked"` step card clickable to jump directly to its target tab, and tailor the top `Overview` monitoring section per role (Superadmin fleet/account summary, Operator machine status & ready/review batch counts, Evaluator pending reviews + **Quality Grade Distribution Chart** for 1★ Poor to 5★ Excellent).
3. **Sprint 3 — Batches Table Simplification, Inline Star Ratings, Calendar Datepicker & Readings Tab (`Workspace.tsx`):** Consolidate the cluttered multi-table `Production` view into **one singular newest-first paginated table** (`ORDER BY started_at DESC, id DESC`), add inline 5-star ratings beside each batch row, compact the search + status dropdown + **Calendar Icon Datepicker** into a single tight toolbar, replace the `"View >"` text link with an accessible **Notebook-with-Magnifying-Glass icon button** (with tooltip and `aria-label`) that opens an in-depth batch inspection modal, and populate the **`Readings`** tab with the 6 live sensor telemetry sparkline cards (`Air Temperature`, `Humidity`, `Fresh-Water Tank`, `Water Temperature`, `Light Level`, `Wastewater Tank`) plus sensor history.
4. **Sprint 4 — Empty/No-Grant UI States, Accessibility Audit & RBAC Verification (`tests/` + `scripts/`):** Implement dedicated empty and permission-denied screens (`"No operator has granted you access yet"` for ungranted Evaluators; `"No device serial ID assigned"` for ungranted Operators), verify keyboard/screen-reader accessibility on the new icon actions and datepicker, and run automated PostgreSQL RLS and Playwright browser tests across all four roles.

## 2. AAS Skill MCP Server (`aas-skills-mcp`) Acquisition Matrix

Before starting each Sprint in **Gemini 3.8 Antigravity**, invoke the **AAS Skill MCP Server** to load the exact domain skills required for that phase.

| Sprint / Phase | AAS Skill Name (`aas-skills-mcp`) | Why & How Antigravity Uses This Skill in `SproutSync-Amaro` | Target Files Touched |
| :--- | :--- | :--- | :--- |
| **Pre-Flight** | `brainstorming`, `concise-planning`, `plan-writing` | Lock requirements, establish the 4-tier RBAC matrix, and track atomic tasks with explicit verification commands. | `sproutsync-qa-rbac-ui-redesign-plan.md` |
| **Sprint 1 (RBAC & DB)** | `access-matrix` | Define the canonical Role-by-Module permissions table (`Superadmin`, `Operator`, `Evaluator`, `No-Grant User`) before touching UI or SQL. | `frontend/dashboard/src/data/workspace.ts`, `backend/api/app/main.py` |
| **Sprint 1 (RBAC & DB)** | `auth-implementation-patterns` | Implement resource-level authorization checks verifying `Superadmin -> Operator (Serial ID)` and `Operator -> Evaluator` grant chains. | `backend/api/app/auth.py`, `backend/api/app/main.py` |
| **Sprint 1 (RBAC & DB)** | `saas-multi-tenant` | Enforce PostgreSQL Row-Level Security (`can_view_owner`, `can_view_device`) and TypeScript query scoping by `owner_id` and `device_id`. | `backend/api/migrations/versions/0011_superadmin_device_grants_rbac.sql` |
| **Sprint 1 (RBAC & DB)** | `audit-log` | Record immutable audit entries in `public.activity_logs` whenever Superadmin updates accounts/serials or Operator grants Evaluator access. | `0011_superadmin_device_grants_rbac.sql`, `Workspace.tsx` |
| **Sprint 2 (Navigation & KPIs)** | `site-architecture` | Design accurate, role-unique sidebar/mobile navigation tab names (e.g., `Readings` instead of `Review`, keeping `Alerts` consistent). | `frontend/dashboard/src/components/Workspace.tsx` |
| **Sprint 2 (Navigation & KPIs)** | `kpi-dashboard-design` | Design role-specific top monitoring cards (Machine Status, Batches Needing Review/Ready) and the Evaluator Quality Grade chart (Poor/Fair/Good/Very Good/Excellent). | `frontend/dashboard/src/components/Workspace.tsx`, `ProtoCharts.tsx` |
| **Sprint 2 (Navigation & KPIs)** | `ux-flow` | Wire clickable `Overview` KPI cards and the 5-step `"How a record is tracked"` cards to navigate directly to target tabs with optional pre-applied filters. | `frontend/dashboard/src/components/Workspace.tsx` |
| **Sprint 3 (Table & Readings UI)** | `build-ui` | Execute the *"dashboard, admin or data-heavy view"* and *"simplify"* workflows for the single newest-first paginated table and compact filter bar. | `frontend/dashboard/src/components/Workspace.tsx`, `workspace.css` |
| **Sprint 3 (Table & Readings UI)** | `redesign-existing-projects` | Refactor `Workspace.tsx` cleanly in place—porting the 6 sensor sparkline cards into `Readings` and decluttering `Production` without breaking existing modals. | `frontend/dashboard/src/components/Workspace.tsx`, `workspace.css` |
| **Sprint 3 (Table & Readings UI)** | `api-patterns` | Enforce deterministic newest-first sorting (`started_at DESC, id DESC`) and clean client/PostgREST pagination state across filter changes. | `frontend/dashboard/src/data/workspace.ts`, `Workspace.tsx` |
| **Sprint 3 (Table & Readings UI)** | `iconsax-library` | Provide the **Notebook with Magnifying Glass** icon (`BookSaved` / `NoteSearch` / custom SVG composite) and **Calendar** datepicker trigger icon. | `frontend/dashboard/src/components/ProtoPrimitives.tsx`, `Workspace.tsx` |
| **Sprint 4 (States, A11y & QA)** | `ui-states` | Build dedicated `NoGrantState` (`"No operator has granted you access yet"`), empty filter results, and loading skeleton states. | `frontend/dashboard/src/components/Workspace.tsx` |
| **Sprint 4 (States, A11y & QA)** | `fixing-accessibility` | Add `aria-label`, `title` / accessible tooltip, keyboard focus rings, and screen-reader announcements to the Notebook-Magnifier icon and Calendar Datepicker. | `frontend/dashboard/src/components/Workspace.tsx`, `workspace.css` |
| **Sprint 4 (States, A11y & QA)** | `marketplace-rbac-audit` | Run cross-role penetration and isolation tests proving `No-Grant`, `Evaluator`, `Operator`, and `Superadmin` cannot read or mutate unauthorized data. | `scripts/verify_workspace_rls.py`, `backend/api/tests/test_workspace_permissions.py` |

### Prompt Template for Gemini 3.8 Antigravity to Load AAS Skills

Paste this initialization prompt into Antigravity at the start of execution:

```text
@brainstorming @plan-writing @concise-planning
Use the `aas-skills-mcp` server to fetch and load the following skills in Sprint order:
- Sprint 1: `access-matrix`, `auth-implementation-patterns`, `saas-multi-tenant`, `audit-log`
- Sprint 2: `site-architecture`, `kpi-dashboard-design`, `ux-flow`
- Sprint 3: `build-ui`, `redesign-existing-projects`, `api-patterns`, `iconsax-library`
- Sprint 4: `ui-states`, `fixing-accessibility`, `marketplace-rbac-audit`
Execute `sproutsync-qa-rbac-ui-redesign-plan.md` sprint-by-sprint, running the verification command after each atomic task before marking it complete.
```

## 3. Brainstorming & Architecture Lock (`@brainstorming`)

### 3.1 Root-Cause Diagnosis in Current `SproutSync-Amaro` Codebase

| QA Requirement | Current State in `SproutSync-Amaro` | Target Architecture & UI Fix |
| :--- | :--- | :--- |
| **1. Evaluator must only see Operators who granted them access; No-Grant users must see nothing** | In `backend/api/migrations/versions/0009_database_demo.sql` (lines 67–76), `public.can_view_owner(target)` includes a fallback: `or (target = (select id from public.users where google_subject='sproutsync-demo-workspace') and not exists(...))`. Any newly registered Evaluator with no Operator grant automatically sees the demo workspace's 3 batches, 10 devices, and readings! | Remove the `sproutsync-demo-workspace` fallback from `public.can_view_owner(target)`. An Evaluator (`role = 'evaluator'`) can view an owner's records **if and only if** an active row exists in `public.evaluator_access` where `owner_id = target` and `evaluator_email = lower(u.email)`. Users with zero grants receive an empty dataset and render the dedicated **No-Grant Restricted State** (`ui-states`). |
| **2. Superadmin role to manage all roles, names, emails, and grant Device Serial IDs to Operators** | `users.role` only distinguishes `'operator'`, `'admin'`, and `'evaluator'`. There is no UI or RPC for Superadmin to edit any user's name/email/role or assign a hardware `serial_number` (`devices.owner_id` / `device_grants`) to a specific Operator. In `Workspace.tsx` (line 748), `"Register an operator"` is a disabled placeholder. | Introduce `'superadmin'` (normalizing legacy `'admin'` to `'superadmin'` or supporting both in `isSuperAdmin()`). Add `SECURITY DEFINER` RPCs (`superadmin_manage_account`, `superadmin_grant_device_serial`, `superadmin_revoke_device_serial`) and FastAPI endpoints (`/api/v1/superadmin/accounts`, `/api/v1/superadmin/device-grants`). |
| **3. Simplify cluttered Production page into one singular paginated table (newest first) with star ratings** | In `Workspace.tsx` (lines 511–636, shown in `image_e112a8.png`), `page === "production"` stacks **three separate tables**: `Production batches`, `Irrigation schedule`, and `Watering history`, and the batch table lacks star ratings. | Make the Batches tab render **one singular, unified paginated table** sorted newest-first (`started_at DESC, id DESC`) with bottom pagination (`DataTable`). Add a **`Rating`** column displaying 1–5 stars (`<Rating value={avgOrEvaluatorRating} />` or `"Unrated"` / quick-rate trigger for Evaluators) directly beside each batch. Move `Irrigation schedule` and `Watering history` to the Operator's dedicated `Irrigation & Water` tab (and inside the batch in-depth inspection modal). |
| **4. Compact search/dropdown toolbar + Calendar Icon Datepicker instead of manual month input** | In `Workspace.tsx` (lines 521–548, shown in `image_e112a8.png`), the search bar takes ~70% width, followed by a tall select and a labeled `START MONTH` `<input type="month">` box. | Redesign `.table-toolbar` into a single compact horizontal bar: compact search input (`max-w-xs`), compact status/stage dropdown, and a **Calendar Icon button + Datepicker popover** (`<input type="date">` / interactive calendar picker triggered by a calendar icon button with active date chip & clear button). |
| **5. Notebook with Magnifying Glass icon replacing `"View >"` for in-depth batch inspection** | In `Workspace.tsx` (lines 274–280), the `Details` column renders a text button `View <ChevronRight size={14} />`. | Replace `View >` with a custom **Notebook with Magnifying Glass icon button** (`<NotebookInspectIcon />` with `aria-label="Inspect batch {code} in depth"` and hover/focus tooltip `"In-depth batch inspection"`). Clicking it opens an enriched **Batch In-Depth Inspection Modal** showing batch metadata, linked sensor readings, irrigation history, evidence checks, and human star evaluation. |
| **6. Clickable Overview cards & role-unique tab names (`Readings` instead of `Review`)** | In `Workspace.tsx` (lines 46–52), all roles share `Overview`, `Production`, `Alerts`, `Review`, `System`. On `Overview`, `<Metric>` cards (lines 415–452) and `<ol className="tracking-map">` (lines 396–413, shown in `image_e0a247.png`) are non-interactive static elements. | Give each role accurate, unique tab names (except `Overview` and `Alerts`), rename `Review` to **`Readings`** (displaying the 6 detailed sensor telemetry cards with sparklines from `image_e0a5e9.png` + readings log), and convert `<Metric>` and `tracking-map` steps into interactive `<button>` cards that navigate to the corresponding tab on click. |
| **7. Role-specific top Overview monitoring cards & Evaluator quality-grade chart** | `Overview` shows the exact same 6 generic `<Metric>` cards to every role. | Customize the top `Overview` monitoring section per role: **Operator** sees Machine Status, Batches Needing Review / Ready for Harvest, Tank Levels, and Open Alerts; **Evaluator** sees Batches Needing Review, Evaluated Batches, Granted Chambers Online, plus a **Quality Grade Breakdown Chart & Visual Guide** (Poor 1★, Fair 2★, Good 3★, Very Good 4★, Excellent 5★); **Superadmin** sees Total Managed Accounts, Serial IDs Granted, Active Operators/Evaluators, and Recent Audit Grants. |

### 3.2 Canonical Role-by-Module Access Matrix (`access-matrix`)

| Module / Capability | Superadmin (`superadmin` / `admin`) | Operator (`operator` with Serial Grant) | Evaluator (`evaluator` with Operator Grant) | No-Grant User (`evaluator` or `operator` with 0 grants) |
| :--- | :--- | :--- | :--- | :--- |
| **Account Directory (Names, Emails, Roles)** | **Full CRUD** (View all accounts, edit `first_name`, `last_name`, `display_name`, `email`, and assign `role`) | Self profile only (`PersonalDetails`) | Self profile only (`PersonalDetails`) | Self profile only (`PersonalDetails`) |
| **Hardware Serial ID Grants (`devices` / `device_grants`)** | **Full CRUD** (Register `serial_number`, grant/assign Serial ID to Operator, revoke Serial ID) | **Read Assigned Only** (View & operate only devices whose `serial_number` was granted by Superadmin) | **Read Granted Operator's Devices Only** (Read-only status for chambers belonging to granting Operator) | **None** (0 devices visible) |
| **Evaluator Access Delegation (`evaluator_access`)** | **Full Override** (View/grant/revoke any Evaluator-to-Operator link) | **Manage Own Grants** (Grant/revoke Evaluator access to own Operator workspace & devices) | **Read Own Grants** (See which Operator(s) granted access) | **None** (Renders `"No operator has granted you access yet"` screen) |
| **Batches (`batches`)** | **Read All** (Audit visibility across fleet) | **Full CRUD on Own** (Create, update stage/notes/status on own granted devices) | **Read Granted Only** (Newest-first paginated table with inline star ratings & in-depth modal) | **None** (Blocked by RLS; no demo fallback) |
| **Evaluations & Star Ratings (`evaluations`)** | **Read All** | **Read Evaluations on Own Batches** (See star ratings beside batches) | **Create & Read Evaluations** (Rate granted batches 1–5★ + comments; see stars beside batches) | **None** |
| **Readings (`telemetry_readings`)** | **Read All** (6 sensor cards + full telemetry table) | **Read Own Devices** (6 sensor sparkline cards + device readings table) | **Read Granted Devices** (6 sensor sparkline cards + device readings table) | **None** |
| **Irrigation & Water (`irrigation_schedules`, `watering_events`)** | **Read All** | **Full CRUD on Own Schedules** + Read Watering History | **Read Granted Only** (Inside Batch In-Depth Modal & Readings) | **None** |
| **Alerts (`alerts`)** | **Read All** | **Create Incident, Acknowledge & Resolve Own** | **Read Granted Only** | **None** |
| **Audit Log (`activity_logs`)** | **Read All System & Grant Audit Logs** (Who granted which serial ID/role/evaluator and when) | **Read Own Workspace Activity** | **Read Granted Batch Activity** | **None** |

### 3.3 Role-Specific Navigation Architecture (`site-architecture`)

| Role | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 | Tab 6 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Superadmin** | `Overview` (`home`) | `Accounts & Roles` (`accounts`) | `Serial ID Grants` (`serials`) | `Readings` (`readings`) | `Alerts` (`alerts`) | `Audit Log` (`audit`) |
| **Operator** | `Overview` (`home`) | `Batch Production` (`production`) | `Readings` (`readings`) | `Irrigation & Water` (`irrigation`) | `Alerts` (`alerts`) | `Chamber & Access` (`system`) |
| **Evaluator** | `Overview` (`home`) | `Batch Evaluations` (`production`) | `Readings` (`readings`) | `Evidence & Checks` (`evidence`) | `Alerts` (`alerts`) | — |
| **No-Grant User** | `Access Pending` (`home` — single restricted state screen with account menu & sign-out) | — | — | — | — | — |

### 3.4 Non-Functional Requirements (NFRs)

- **Zero Data Leakage (`saas-multi-tenant` & `marketplace-rbac-audit`):** Enforcement happens in PostgreSQL RLS (`public.can_view_owner`, `public.is_superadmin`, `public.is_operator`) and FastAPI dependencies—never by hiding rows in React alone.
- **Audit Traceability (`audit-log`):** Every Superadmin role assignment, name/email edit, serial ID grant to an Operator, and Operator access grant to an Evaluator writes an immutable row to `public.activity_logs` recording `actor_id`, `owner_id`, `action`, and `resource` (including `serial_number` and target email).
- **Deterministic Newest-First Pagination (`api-patterns`):** Batch queries and client-side table pagination sort strictly by `started_at DESC, id DESC` (6–10 items per page) and automatically reset to Page 1 when search, status dropdown, or calendar date filters change.
- **WCAG 2.1 AA Accessibility (`fixing-accessibility`):** Icon-only controls (the **Notebook-with-Magnifying-Glass** batch inspection button and the **Calendar Icon Datepicker** trigger) include explicit `aria-label` attributes, keyboard focus styles (`:focus-visible`), and hover/focus tooltips.

### 3.5 Architectural Decision Log

| Decision | Alternatives Considered | Why This Option Was Chosen |
| :--- | :--- | :--- |
| **1. Remove `sproutsync-demo-workspace` fallback from `can_view_owner` in PostgreSQL** | Filter out demo rows in `Workspace.tsx` | QA explicitly requires that any user without an Operator grant (or Superadmin serial grant) has zero access to batches or readings. Removing the SQL fallback enforces this at the database layer. |
| **2. Enforce Superadmin Serial ID Grants via `public.devices` + `superadmin_grant_device_serial` RPC** | Let Operators self-register arbitrary serial numbers | QA specified: *"We will also have Superadmin where he will grant the serial ID to a operator to grant him access over that device. Superadmin will manage all roles and granting access to any accounts including names and email address."* |
| **3. Consolidate `Batch Production` / `Batch Evaluations` into a single paginated table with inline `<Rating />` stars** | Keep 3 stacked tables on `Production` and put ratings on a separate `Review` page | Directly addresses QA feedback: *"The evaluator should have rating stars beside the batches and this cluttered table to be one singular table with pagification on the bottom newest batches first so in short simplify the UI here for ease of use while seeing the important information."* |
| **4. Replace `Review` tab with `Readings` tab featuring the 6 sensor sparkline cards (`image_e0a5e9.png`) + sensor log** | Keep `Readings` hidden inside a modal button on `Overview` | Directly satisfies: *"Instead of Reviews It should be readings instead and display the sensor data there in detail."* Porting the 6 rich sensor cards (`Air Temperature`, `Humidity`, `Fresh-Water Tank`, `Water Temperature`, `Light Level`, `Wastewater Tank`) into `Readings` makes live and historical telemetry a first-class tab. |
| **5. Replace `"View >"` with an accessible Notebook-with-Magnifying-Glass icon button + tooltip** | Use a generic eye icon | Matches the exact user specification: *"instead of view it should be a Icon of the notebook with magnifying glass instead where they can in depht more about the batches."* |

## 4. Scope Definition (`@concise-planning`)

- **In Scope:**
  - **Database & RLS Migration (`0011_superadmin_device_grants_rbac.py` / `.sql`):** Add `superadmin` role support, `is_superadmin()` helper, strict `can_view_owner(target)` without demo leakage, `granted_by` audit columns on `devices` and `evaluator_access`, and `SECURITY DEFINER` RPCs for Superadmin account management (name, email, role) and serial ID assignment to Operators.
  - **Backend API (`backend/api/app/main.py`, `auth.py`, `models.py`):** Add `require_superadmin` dependency and endpoints for listing/updating accounts (`PATCH /api/v1/superadmin/users/{user_id}`) and granting serial IDs (`POST /api/v1/superadmin/device-grants`).
  - **Role-Based Navigation & Clickable Overview (`frontend/dashboard/src/components/Workspace.tsx`, `ProtoCharts.tsx`):** Role-specific tab names (`Readings` replacing `Review`), clickable `Overview` KPI cards and tracking steps, role-tailored top monitoring KPIs, and an Evaluator **Quality Grade Distribution Chart** (`Poor`, `Fair`, `Good`, `Very Good`, `Excellent`).
  - **Simplified Single Batches Table & Compact Toolbar (`Workspace.tsx`, `workspace.css`):** Single newest-first paginated table with inline star ratings beside each batch, compact search + status dropdown + **Calendar Icon Datepicker**, and **Notebook-with-Magnifying-Glass** icon button opening an in-depth batch modal.
  - **Detailed `Readings` Tab & Empty/No-Grant States (`Workspace.tsx`):** Render the 6 sensor cards with sparklines and reference ranges (`image_e0a5e9.png`) plus paginated sensor history in `Readings`, and render a dedicated `"No operator has granted you access yet"` state when an Evaluator has no grants.
- **Out of Scope:**
  - Changing ESP32 C++ firmware (`iot/esp32/`) or MQTT broker topology.
  - Native iOS App Store provisioning.

## 5. Agile Implementation Sprints & Atomic Tasks (`@plan-writing` + `@concise-planning`)

### Sprint 1: Access Matrix, Multi-Tenant RLS, Serial ID Grants & Audit Logs
**AAS Skills to Load:** `access-matrix`, `auth-implementation-patterns`, `saas-multi-tenant`, `audit-log`

- [x] **Task 1.1: Create Migration `0011_superadmin_device_grants_rbac.sql` & `.py` for Strict RBAC & Serial Grants**
  - **Action:** Create `backend/api/migrations/versions/0011_superadmin_device_grants_rbac.sql` and its Alembic wrapper `0011_superadmin_device_grants_rbac.py` (`down_revision = "0010_verification_attempts"`):
    1. Add `granted_by integer references public.users(id)` and `granted_at timestamptz default now()` to `public.devices` and `public.evaluator_access`.
    2. Create `public.is_superadmin() returns boolean` checking `role in ('superadmin', 'admin')`.
    3. Replace `public.can_view_owner(target integer)` so:
       - `public.is_superadmin()` returns `true`.
       - `target = public.current_profile_id()` returns `true` **only** when the user is an Operator with at least one Superadmin-granted device (`exists(select 1 from public.devices d where d.owner_id = target)`) or is viewing their own empty operator workspace.
       - An Evaluator (`role = 'evaluator'`) returns `true` **only** when `exists(select 1 from public.evaluator_access a join public.users u on lower(u.email) = a.evaluator_email where a.owner_id = target and u.id = public.current_profile_id())` — **completely removing** the `sproutsync-demo-workspace` ungranted fallback.
    4. Create `SECURITY DEFINER` RPC `public.superadmin_update_account(target_user_id integer, new_email text, new_first_name text, new_last_name text, new_role text, new_organization text)` that verifies `public.is_superadmin()`, updates `public.users` (and syncs `display_name`), and inserts an audit entry in `public.activity_logs` (`action = 'superadmin_account_update'`, `resource = 'users:' || target_user_id || ':' || new_role`).
    5. Create `SECURITY DEFINER` RPC `public.superadmin_grant_serial(operator_user_id integer, device_serial text, device_name text)` that verifies `public.is_superadmin()`, upserts `public.devices (owner_id, serial_number, name, granted_by, granted_at, status)`, and writes an audit log (`action = 'grant_serial_id'`, `resource = 'devices:' || upper(trim(device_serial)) || '->user:' || operator_user_id`).
    6. Add trigger `evaluator_access_audit` on `public.evaluator_access` (`AFTER INSERT OR DELETE`) to log `grant_evaluator_access` and `revoke_evaluator_access` in `public.activity_logs`.
  - **Verify:** Run `python -m compileall -q backend/api/migrations` and `python scripts/validate_pending_migrations.py` → exits `0`.

- [x] **Task 1.2: Add Superadmin & Grant Endpoints in FastAPI (`backend/api/app/main.py` & `models.py`)**
  - **Action:**
    1. In `backend/api/app/main.py`, add `require_superadmin(user: User = Depends(get_current_user)) -> User` raising `403` unless `user.role in ("superadmin", "admin")`.
    2. Add `GET /api/v1/superadmin/accounts` (lists all users with role, email, name, granted serial count, and evaluator grant count), `PATCH /api/v1/superadmin/accounts/{user_id}` (updates `first_name`, `last_name`, `display_name`, `email`, `role`, `organization` and logs to `activity_logs`), and `POST /api/v1/superadmin/device-grants` (assigns `serial_number` + `name` to an `operator_id` and logs to `activity_logs`).
    3. Update `/api/v1/batches` (`list_batches`) so Evaluators only receive batches where `Batch.owner_id` is in their `evaluator_access` grants, and Operators only receive batches for their granted devices.
  - **Verify:** Run `pytest backend/api/tests -q` → all existing and new permission tests pass (`0` failures).

- [x] **Task 1.3: Extend Frontend Workspace Data Layer for Superadmin, Grants & Access Checks (`src/data/workspace.ts` & `App.tsx`)**
  - **Action:**
    1. In `frontend/dashboard/src/data/workspace.ts`, add helpers:
       - `export const isSuperAdmin = (profile: Profile) => ["superadmin", "admin"].includes(profile.role);`
       - `export const isOperator = (profile: Profile) => profile.role === "operator";`
       - `export const isEvaluator = (profile: Profile) => profile.role === "evaluator";`
       - Add `UserAccount` type and `Access` fields (`id`, `owner_id`, `evaluator_email`, `created_at`), plus `hasActiveGrant(profile, data)` which checks whether an Evaluator has at least one row in `data.access` / visible Operator batch grant, or whether an Operator has at least one Superadmin-granted device in `data.devices`.
    2. In `frontend/dashboard/src/App.tsx`, route `isSuperAdmin(profile)` to `/superadmin` (or `/operator` with Superadmin workspace mode), `isOperator(profile)` to `/operator`, and `isEvaluator(profile)` to `/dashboard`.
  - **Verify:** Run `npm run typecheck -w @sproutsync/dashboard` → exits `0`.

### Sprint 2: Role-Specific Tabs, Clickable Overview KPIs & Quality Grade Charts
**AAS Skills to Load:** `site-architecture`, `kpi-dashboard-design`, `ux-flow`

- [x] **Task 2.1: Implement Role-Unique Navigation Tabs (`site-architecture` in `Workspace.tsx`)**
  - **Action:** Replace the static `const pages = [...]` array in `frontend/dashboard/src/components/Workspace.tsx` with `getRolePages(profile: Profile, hasGrant: boolean)`:
    - **If `!hasGrant` (and not Superadmin):** Return `[{ key: "home", title: "Access Status", icon: ShieldCheck }]` so ungranted users cannot browse empty tabs.
    - **Superadmin (`isSuperAdmin`):** `Overview` (`home`), `Accounts & Roles` (`accounts`), `Serial ID Grants` (`serials`), `Readings` (`readings`), `Alerts` (`alerts`), `Audit Log` (`audit`).
    - **Operator (`isOperator`):** `Overview` (`home`), `Batch Production` (`production`), `Readings` (`readings`), `Irrigation & Water` (`irrigation`), `Alerts` (`alerts`), `Chamber & Access` (`system`).
    - **Evaluator (`isEvaluator`):** `Overview` (`home`), `Batch Evaluations` (`production`), `Readings` (`readings`), `Evidence & Checks` (`evidence`), `Alerts` (`alerts`).
  - **Verify:** Run `npm run typecheck -w @sproutsync/dashboard` and verify each role renders its unique sidebar and mobile bottom navigation labels.

- [x] **Task 2.2: Make Overview Metric Cards & Tracking Map Steps Clickable (`ux-flow` in `Workspace.tsx`)**
  - **Action:**
    1. Update `Metric` in `Workspace.tsx` to accept `onClick?: () => void` and `targetLabel?: string`. Render `<button type="button" onClick={onClick} className="summary-card summary-card-interactive">` with a subtle right chevron and hover/focus elevation so clicking any KPI card jumps directly to its tab (e.g., clicking `Batches needing review` jumps to `production` with filter set to unreviewed/ready; clicking `Machine status` or `Current conditions` jumps to `readings`; clicking `Open alerts` jumps to `alerts`).
    2. Convert the 5 items in `<ol className="tracking-map">` (`1 Batch`, `2 Sensors & alerts`, `3 Evidence`, `4 Evaluation`, `5 Activity log`) into interactive buttons that call `navigate(...)` for the matching tab in the active role's navigation.
  - **Verify:** Click each KPI card and tracking step in the browser / Playwright test and confirm `page` state updates to the target tab.

- [x] **Task 2.3: Build Role-Specific Top Overview KPIs & Evaluator Quality Grade Chart (`kpi-dashboard-design` in `Workspace.tsx` & `ProtoCharts.tsx`)**
  - **Action:**
    1. In `ProtoCharts.tsx`, add `QualityGradeChart({ evaluations }: { evaluations: Evaluation[] })` which renders:
       - A 5-tier horizontal bar / donut breakdown of batch ratings: **1★ Poor** (`#EF4444`), **2★ Fair** (`#F59E0B`), **3★ Good** (`#3B82F6`), **4★ Very Good** (`#10B981`), **5★ Excellent** (`#059669`).
       - Visual quality reference descriptors beside the chart explaining what each grade looks like in physical sprout inspection (e.g., **Poor (1★):** sour odor, slimy hypocotyls, or >20% ungerminated seeds; **Fair (2★):** uneven sprout length, mild discoloration, or low moisture; **Good (3★):** uniform 3–5 cm sprouts, clean scent, crisp cotyledons; **Very Good / Excellent (4–5★):** vibrant ivory-green shoots, zero rot, optimal turgor and yield).
    2. In `Workspace.tsx` (`page === "home"`), render role-tailored top KPI cards:
       - **Evaluator Top Overview:** `Batches needing review` (batches without an evaluation by this evaluator → clicks to `Batch Evaluations`), `Batches ready for harvest` (`stage === 'ready'` → clicks to `Batch Evaluations`), `Granted chambers online` (`online / total devices` → clicks to `Readings`), `Open alerts` (clicks to `Alerts`), plus the **`QualityGradeChart`** card right below the KPI grid.
       - **Operator Top Overview:** `Machine status` (`X / Y online` with serial health → clicks to `Readings`), `Batches ready / needing review` (clicks to `Batch Production`), `Active batches` (clicks to `Batch Production`), `Fresh-water & tank status` (clicks to `Readings`), `Next irrigation run` (clicks to `Irrigation & Water`), `Open alerts` (clicks to `Alerts`).
       - **Superadmin Top Overview:** `Managed accounts` (clicks to `Accounts & Roles`), `Granted serial IDs` (clicks to `Serial ID Grants`), `Fleet machine status` (clicks to `Readings`), `Audit events today` (clicks to `Audit Log`).
  - **Verify:** Run `npm run typecheck -w @sproutsync/dashboard` → exits `0`.

### Sprint 3: Single Paginated Batches Table, Calendar Datepicker, Notebook-Magnifier Icon & Readings Tab
**AAS Skills to Load:** `build-ui`, `redesign-existing-projects`, `api-patterns`, `iconsax-library`

- [x] **Task 3.1: Simplify Batches View into One Singular Newest-First Paginated Table with Inline Star Ratings (`build-ui` & `api-patterns`)**
  - **Action:**
    1. In `Workspace.tsx`, remove `Irrigation schedule` and `Watering history` from `page === "production"` (moving them to `page === "irrigation"` for Operators and into the Batch In-Depth Modal for all roles) so `page === "production"` contains **only one singular, clean card and table**.
    2. Sort `batches` deterministically newest-first:
       ```ts
       const sortedBatches = [...filteredBatches].sort(
         (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime() || b.id - a.id
       );
       ```
    3. Add a **`Quality Rating`** column right beside each batch in `batchTable`:
       - Compute the batch's latest/average evaluation rating from `data.evaluations.filter(e => e.batch_id === b.id)`.
       - Render `<Rating value={rating} />` (5 interactive/visual stars beside the batch code/stage). For Evaluators, if a batch is not yet rated by them, render an inline star button (`Rate batch` with hollow stars) or display the current star rating alongside a quick-rate trigger.
    4. Update `DataTable` in `Workspace.tsx` so the bottom pagination bar (`Previous`, page numbers `1, 2, ...`, `Next`, plus `"Showing X–Y of Z batches (Newest first)"`) is always visible at the bottom of the singular batch table and resets to `page = 1` when filters change.
  - **Verify:** Inspect `page === "production"` to confirm there is exactly 1 table on the page, sorted newest batch first (`MB-2410`, `MB-2409`, `MB-2408`), with star ratings beside each batch and pagination at the bottom.

- [x] **Task 3.2: Build Compact Search, Dropdown & Calendar Icon Datepicker Toolbar (`build-ui` & `iconsax-library`)**
  - **Action:**
    1. In `Workspace.tsx` and `workspace.css`, refactor `.table-toolbar` into a compact, single-row flex/grid bar (`gap-2`, `items-center`, `h-10` controls):
       - **Compact Search Input:** `max-w-[240px]` input with search icon (`placeholder="Search batch, crop…"`).
       - **Compact Status/Stage Dropdown:** Compact `<select>` (`All stages & statuses`, `Active`, `Ready for review`, `Soaking`, `Growing`, `Harvested`, `Unrated`).
       - **Calendar Icon Datepicker (`CalendarDatePicker`):** Replace the manual `START MONTH` `<input type="month">` box with a compact **Calendar Icon button** (`<Calendar size={16} />` + selected date badge or `"Filter date"`). Clicking the calendar icon opens a sleek popover calendar datepicker (or triggers `inputRef.current?.showPicker()` with a custom popover calendar grid) allowing the user to pick a specific start/harvest date or date range with one click, plus an inline `×` clear button.
  - **Verify:** Run `npm run typecheck -w @sproutsync/dashboard` and verify selecting a date from the calendar icon filters the batch table and resets pagination to Page 1.

- [x] **Task 3.3: Replace `"View >"` with Notebook-with-Magnifying-Glass Icon & Rich In-Depth Batch Modal (`iconsax-library` & `fixing-accessibility`)**
  - **Action:**
    1. In `ProtoPrimitives.tsx` (or `Workspace.tsx`), create `<NotebookInspectIcon size={18} />`: a crisp dual-path SVG icon combining a **Notebook/Journal with ruled lines** and a **Magnifying Glass loupe** over the bottom-right corner (matching `iconsax` `NoteSearch` / `BookSaved` aesthetic).
    2. In `batchTable` (`Workspace.tsx`), replace `View <ChevronRight size={14} />` with:
       ```tsx
       <button
         type="button"
         className="icon-action-btn"
         onClick={() => open({ kind: "batch-details", batch: b })}
         aria-label={`In-depth batch details for ${b.code}`}
         title={`Inspect ${b.code} in depth (readings, watering, evidence & evaluation)`}
       >
         <NotebookInspectIcon size={18} />
         <span className="sr-only">Inspect {b.code} in depth</span>
       </button>
       ```
    3. Enhance `dialog?.kind === "batch-details"` in `Workspace.tsx` so clicking the Notebook-with-Magnifying-Glass icon opens a comprehensive **In-Depth Batch Dossier Modal** containing:
       - **Batch Summary & Lifecycle Progress** (`code`, `owner`, `seed_type`, `stage`, `started_at`, `target_harvest_at`, `notes`).
       - **Latest Chamber Sensor Snapshot** (Temperature, Humidity, Fresh Water %, Water °C, Light lux, Wastewater % for the batch's device).
       - **Batch Watering History** (Recent irrigation events for `batch.id`).
       - **Acceptance Evidence & Checks** (Linked evidence records for `batch.id`).
       - **Evaluator Star Rating & Assessment Section** (Displays all submitted star ratings + comments for `batch.id`, and provides an inline `"Submit / Update Rating"` form for Evaluators or stage update form for Operators).
  - **Verify:** Click the Notebook-with-Magnifying-Glass icon on any batch row and confirm the tooltip, `aria-label`, and full in-depth modal render properly.

- [x] **Task 3.4: Build the Detailed `Readings` Tab with 6 Sensor Sparkline Cards & Telemetry Log (`redesign-existing-projects`)**
  - **Action:**
    1. In `Workspace.tsx`, replace `page === "review"` with `page === "readings"`.
    2. At the top of `page === "readings"`, render a compact device selector dropdown (`All granted chambers` or specific `serial_number` / `device.name`) and the **6 Detailed Sensor Telemetry Cards** (matching `image_e0a5e9.png`):
       - **Air Temperature** (`°C`, `Ref 21–27 °C`, status badge `Within range` / `Check range`, 7-point green `<Spark />` trend line).
       - **Humidity** (`%`, `Ref 80–90 %`, status badge `Within range`, 7-point blue `<Spark />` trend line).
       - **Fresh-Water Tank** (`%`, `Ref > 40 %`, status badge `Getting low` when `<= 40%` else `Within range`, 7-point amber `<Spark />` trend line).
       - **Water Temperature** (`°C`, `Ref 18–22 °C`, status badge `Within range`, 7-point purple `<Spark />` trend line).
       - **Light Level** (`lux`, `Ref ~0 lux`, status badge `Nice & dark` when `< 5 lux` else `Light detected`, 7-point indigo `<Spark />` trend line).
       - **Wastewater Tank** (`%`, `Ref < 85 %`, status badge `Room available` when `< 85%` else `Near full`, 7-point cyan `<Spark />` trend line).
    3. Below the 6 cards, render the **Paginated Historical Sensor Readings Table** (newest readings first, with device serial number, all 6 sensor values, timestamp, and CSV print/export option) plus the **7-Day Water Use Chart** (`<WaterUseChart />`).
  - **Verify:** Open the `Readings` tab in `Workspace.tsx` and confirm all 6 sensor cards with sparklines and the paginated telemetry table render from live `data.readings`.

### Sprint 4: Superadmin Management UI, Empty/No-Grant States, Accessibility & RBAC Verification
**AAS Skills to Load:** `ui-states`, `fixing-accessibility`, `marketplace-rbac-audit`

- [x] **Task 4.1: Build Superadmin `Accounts & Roles`, `Serial ID Grants` & `Audit Log` Views (`Workspace.tsx`)**
  - **Action:**
    1. **`page === "accounts"` (Superadmin only):** Render a compact search + role filter toolbar and a paginated table of all user accounts (`Display Name`, `First & Last Name`, `Email Address`, `Current Role`, `Granted Serials / Evaluators`, `Actions`). Clicking `Edit account & role` opens a modal wired to `superadmin_update_account` / `PATCH /api/v1/superadmin/accounts/{id}` allowing Superadmin to edit `first_name`, `last_name`, `email`, `organization`, and `role` (`superadmin`, `operator`, `evaluator`).
    2. **`page === "serials"` (Superadmin only):** Render a `"Grant Device Serial ID to Operator"` button and paginated table of all hardware devices (`Serial ID`, `Equipment Name`, `Assigned Operator Name & Email`, `Status`, `Last Seen`, `Granted At`). Superadmin can assign a new `serial_number` to any Operator account or reassign/revoke access.
    3. **`page === "system"` (Operator `Chamber & Access` tab):** Allow Operators to view their Superadmin-granted device serial numbers, record maintenance, and grant/revoke **Evaluator access** (`evaluator_access` by email) so the Evaluator is immediately scoped to that Operator's batches and readings.
    4. **`page === "audit"` (Superadmin only):** Render the immutable audit trail from `data.activity` showing who granted which serial ID, role change, or evaluator access and when.
  - **Verify:** Run `npm run typecheck -w @sproutsync/dashboard` and test Superadmin account/role editing and serial ID assignment.

- [x] **Task 4.2: Implement Dedicated No-Grant & Empty UI States (`ui-states` in `Workspace.tsx`)**
  - **Action:**
    1. When an Evaluator logs in and `data.batches.length === 0 && data.devices.length === 0` (no Operator has granted them access in `evaluator_access`), render a clean, reassuring **No-Grant Restricted Screen** on `Workspace`:
       - Icon: `<ShieldCheck size={36} />`
       - Title: `"Waiting for Operator Access Grant"`
       - Message: `"Your Evaluator account ({profile.email}) is active, but no Operator has granted you access to their chamber batches yet. Share your email address with an authorized Operator or Superadmin to receive batch and sensor reading access."`
       - Action buttons: `"Refresh access status"` (`reload()`) and `"Profile & settings"`.
    2. When an Operator logs in with zero Superadmin-granted device serial IDs (`data.devices.length === 0`), display a prominent banner on `Overview`: `"No Chamber Serial ID Assigned — Ask your Superadmin to grant a device Serial ID to {profile.email} to begin live telemetry and batch production."`
  - **Verify:** Log in as a newly created Evaluator with zero `evaluator_access` rows and confirm 0 demo batches are leaked and the `"Waiting for Operator Access Grant"` state appears.

- [x] **Task 4.3: End-to-End RBAC Penetration Audit & Browser Verification (`marketplace-rbac-audit` & `fixing-accessibility`)**
  - **Action:**
    1. Update `scripts/verify_workspace_rls.py` and `backend/api/tests/test_workspace_permissions.py` to test all 4 personas:
       - **No-Grant Evaluator:** `SELECT count(*) FROM public.batches` returns `0`; `SELECT count(*) FROM public.telemetry_readings` returns `0`; cannot insert evaluations on ungranted batches.
       - **Granted Evaluator:** Sees **only** the granting Operator's batches and readings; can submit 1–5★ evaluations on granted batches; cannot see another Operator's batches; cannot mutate batches or devices.
       - **Operator:** Sees **only** devices/serials granted by Superadmin and own batches; can grant/revoke Evaluator access; cannot change roles or assign serial IDs.
       - **Superadmin:** Can update any user's name, email, and role; can grant device serial IDs to Operators; every action creates an `activity_logs` row.
    2. Update `frontend/dashboard/tests/` Playwright tests to verify:
       - Single newest-first paginated Batches table with inline star ratings.
       - Calendar Icon Datepicker and Notebook-with-Magnifying-Glass icon button (`aria-label` + tooltip + in-depth modal).
       - Clickable `Overview` cards and `Readings` tab with the 6 sensor telemetry sparkline cards.
  - **Verify:**
    - `npm run build` → exits `0`
    - `npm run test:browser -w @sproutsync/dashboard` → all Playwright tests pass
    - `pytest backend/api/tests -q` → all backend tests pass
    - `python scripts/verify_workspace_rls.py` → exits `0`

## 6. Definition of Done Checklist (`@plan-writing`)

- [x] **Strict Evaluator & Operator Grant Scoping:** Evaluators only see data from Operators who granted them access; ungranted Evaluators see the `"Waiting for Operator Access Grant"` state with zero leaked demo batches.
- [x] **Superadmin Full Control:** Superadmin can manage all roles, edit account names and email addresses, and grant Device Serial IDs to Operators, with full audit logging.
- [x] **Single Paginated Batches Table (Newest First) + Star Ratings:** The cluttered 3-table Production view is simplified into one newest-first paginated table with star ratings right beside each batch.
- [x] **Compact Filter Bar with Calendar Icon Datepicker & Notebook-Magnifier Icon:** Manual month input is replaced by a Calendar Icon Datepicker, `"View >"` is replaced by an accessible Notebook-with-Magnifying-Glass icon opening in-depth batch details, and the search/dropdown toolbar is compact.
- [x] **Clickable Overview, Role-Tailored KPIs/Charts & `Readings` Tab:** Overview cards and tracking steps are clickable to navigate to tabs, top KPIs match each role (including the Evaluator Quality Grade chart for Poor/Fair/Good/Very Good/Excellent), and `Review` is replaced by `Readings` showing the 6 detailed sensor telemetry cards (`image_e0a5e9.png`).
