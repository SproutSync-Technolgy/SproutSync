# SproutSync UI Polish, Table Simplification & `/api/v1/health` 500 Fix Plan (`SproutSync-Amaro`)

> **Project Root Plan Slug:** `sproutsync-ui-polish-and-health-500-plan.md`
> **Skills Applied:** `@brainstorming` (Root-Cause Diagnosis, Understanding Lock, NFRs, Decision Log) · `@concise-planning` (Approach, Scope & Atomic Checklist) · `@plan-writing` (Task-to-Verification Mapping)

## 1. Goal & High-Level Approach (`@concise-planning` + `@plan-writing`)

**Goal:** Eliminate the teammate environment bug (`App.tsx:391 GET http://localhost:5173/api/v1/health net::ERR_ABORTED 500` + broken styles) and polish `Workspace.tsx` and `workspace.css` by consolidating multi-table views into single scannable tables, trimming redundant columns, decluttering above-the-fold chrome, and fixing broken navigation targets.

**Approach:**
1. **Harden Dev Startup, Proxy & Teammate Sync (`vite.config.ts`, `start.bat`, `scripts/start-dev.ps1`):** Fix the Vite `/api` proxy so offline/stopped Docker backends return a clean JSON fallback instead of throwing a Vite `500 Internal Server Error`, update `start.bat` to verify `@tailwindcss/vite` and clear stale `.vite` caches so Tailwind v4 styles never break on a teammate's machine, and provide a 4-command sync sequence for teammates still on an older branch where `App.tsx` had line 391.
2. **Simplify Tables & Column Density (`Workspace.tsx`, `workspace.css`):** Reduce `batchTable` from 8 columns to 5 high-signal columns (merging `Batch` + `Crop`/Owner metadata and combining `Stage` + `Status`), replace multi-table vertical stacks in `Irrigation & Water`, `Evidence & Checks`, and `Chamber & Access` with clean segmented view toggles, and unify all row inspection actions to use `<NotebookInspectIcon />`.
3. **Declutter Above-the-Fold UI & Fix Navigation Bugs (`Workspace.tsx`):** Merge the stacked `welcome-panel` + `role-brief` banners into one compact header strip, make the 5-step tracking map collapsible, wire `Overview → View readings` directly to the `Readings` tab instead of a duplicate 8-column modal, and fix the broken Superadmin `"Granted serial IDs"` KPI card (`navigate("serials")` → `navigate("accounts")` filtered to Operators).

## 2. Brainstorming & Root-Cause Diagnosis (`@brainstorming`)

### 2.1 Why Your Teammate Sees `App.tsx:391 GET http://localhost:5173/api/v1/health 500` & a Messed-Up UI

| Symptom on Teammate's Machine | Exact Root Cause in `SproutSync-Amaro` | Permanent Fix |
| :--- | :--- | :--- |
| **1. Stack trace points to `App.tsx:391` calling `GET /api/v1/health`** | In the current `SproutSync-Amaro(3)` codebase, `frontend/dashboard/src/App.tsx` is **252 lines long** and no longer calls `/api/v1/health`. Your teammate is either running an **older Git branch/commit** (from before the `SessionRouter` + `Workspace` refactor, when `App.tsx` was ~430 lines and polled `/api/v1/health` at line 391 for the `.api-indicator` dot) or has a **stale Vite cache** (`node_modules/.vite`). | Have the teammate pull the latest branch, run `npm install`, and clear `frontend/dashboard/node_modules/.vite`. Also add a silent `/api/v1/health` proxy fallback in `vite.config.ts` so even legacy health checks never throw a `500`. |
| **2. `GET http://localhost:5173/api/v1/health net::ERR_ABORTED 500 (Internal Server Error)`** | `frontend/dashboard/vite.config.ts` (line 7) proxies `/api` to `http://127.0.0.1:8000`. When Docker Desktop is not running, or the `api` container exits/fails to bind port `8000` (e.g., missing `.env` `POSTGRES_PASSWORD` or `DATABASE_URL`), Vite's built-in `http-proxy` gets `ECONNREFUSED` and returns **HTTP `500 Internal Server Error`**. React `<StrictMode>` (`main.tsx:6`) double-mounts the effect and aborts the first failed request, producing `net::ERR_ABORTED 500`. | Configure a custom `configure(proxy)` error handler in `frontend/dashboard/vite.config.ts` so when `127.0.0.1:8000` is unreachable in local dev, `/api/v1/health` returns `200 {"status":"offline","service":"vite-fallback"}` and other `/api/*` endpoints return `503 {"detail":"Backend API container is offline"}` instead of crashing with an unhandled Vite 500 error. |
| **3. "The UI is messed up" (broken layout / missing Tailwind styles)** | `frontend/dashboard/src/styles.css` (line 2) uses **Tailwind CSS v4** (`@import "tailwindcss";`) powered by `@tailwindcss/vite` in `vite.config.ts`. However, `start.bat` (lines 33–60) only checks for `node_modules`, `@supabase/supabase-js`, and `lucide-react`—it **never checks if `node_modules\@tailwindcss\vite` is installed**, and also imports legacy conflicting `.workspace-*` rules at the bottom of `styles.css` (lines 193–344). If a teammate pulled the repo without re-running `npm install`, `@tailwindcss/vite` is missing or cached improperly, leaving all Tailwind utility classes (`flex`, `grid`, `rounded-2xl`, `gap-4`, `p-4`) unstyled! | Update `start.bat` to check `node_modules\@tailwindcss\vite` and `frontend\dashboard\src\assets\chamber-model.png`, and remove dead legacy `.workspace-*` CSS rules in `styles.css` (lines 193–344) that only belonged to the archived prototype. |

### 2.2 UI & Table Audit Across `Workspace.tsx` and `workspace.css`

| Surface / Table | Current Friction in `Workspace.tsx` | Simplification & Usability Upgrade |
| :--- | :--- | :--- |
| **1. `Batch Production` / `Batch Evaluations` Table (`Workspace.tsx:461–542`)** | Renders **8 separate columns** (`Batch`, `Owner`, `Crop`, `Stage`, `Status`, `Quality Rating`, `Target harvest`, `Actions`). `Owner` (`Operator #22`) is redundant for Operators viewing their own workspace, and having separate `Stage` and `Status` badge columns forces horizontal scrolling on 13-inch laptops. | Condense from **8 columns → 5 scannable columns**: **1) `Batch & Crop`** (`<strong>{b.code}</strong>` + subtle subtitle `{b.seed_type}` and `Operator #{b.owner_id}` only for Superadmin/Evaluator), **2) `Lifecycle Stage`** (clickable `<Status value={b.stage} />` pill + inline `Archived` tag if archived), **3) `Quality Rating`** (stars + quick-rate CTA), **4) `Target Harvest`**, and **5) `Inspect`** (`<NotebookInspectIcon />`). |
| **2. `Overview` Above-the-Fold Stack (`Workspace.tsx:900–1325`)** | Stacks **6 vertical sections** (`welcome-panel`, `role-brief`, `How a record is tracked` 5-step cards, `summary-grid` KPIs, `Current conditions` + `Next irrigation`, and `Recent batches`). Users must scroll past 3 banners before seeing KPIs or batches. Also, clicking `"View readings"` on `Overview` (line 1216) opens a cramped 8-column modal (`dialog?.kind === "readings"`) instead of the `Readings` tab, and `"View irrigation"` (line 1305) wrongly calls `navigate("production")` instead of `navigate("irrigation")`. | Combine `welcome-panel` and `role-brief` into a single compact **Role Header Strip** with a `"How tracking works"` collapsible toggle for the 5-step map. Change `"View readings"` to `navigate("readings")`, fix `"View irrigation"` to `navigate("irrigation")`, and remove the duplicate `dialog?.kind === "readings"` modal. |
| **3. Broken Superadmin KPI Link (`Workspace.tsx:1102–1109`)** | On Superadmin `Overview`, the `"Granted serial IDs"` metric card calls `onClick={() => navigate("serials")}`. Because `"serials"` is not in `getRolePages()`, the `useEffect` at line 294 immediately resets `page` back to `"home"`! | Wire the `"Granted serial IDs"` KPI card to `setAccountRoleFilter("operator"); navigate("accounts");` so clicking it opens the `Accounts` table pre-filtered to Operators and their assigned serial numbers. |
| **4. `Irrigation & Water` Triple-Table Stack (`Workspace.tsx:1803–1887`)** | Stacks 3 separate tables vertically (`Irrigation schedule`, `Watering history`, `Water use by batch`), forcing heavy scrolling. | Add a compact **3-tab segmented pill bar** (`Schedules (${data.schedules.length})` · `Watering Log (${data.watering.length})` · `Batch Totals (${ totalLitres.toFixed(1) } L)`) inside one unified card so only one focused table is shown at a time. |
| **5. `Chamber & Access` 5-Section Stack (`Workspace.tsx:2563–2763`)** | Stacks 5 sections vertically (`Sensors & chamber equipment`, `Monitoring coverage` 8-card static grid, `Maintenance records`, `Pending Evaluator Requests`, `My Evaluators`). Pending evaluator approvals are buried at the bottom of the page. | Promote `Pending Evaluator Requests` to a high-visibility top alert banner whenever `accessRequests.length > 0`, and split `Chamber & Access` into two clean segmented views: **`Equipment & Maintenance`** and **`Evaluator Access (${operatorEvaluators.length})`**, collapsing the static 8-card `Monitoring coverage` text into a compact info disclosure. |
| **6. `Evidence & Checks` Dual-Table Stack (`Workspace.tsx:1888–2041`)** | Stacks `Evaluation evidence & machine checks` above `Submitted evaluations`, uses a large multi-row rubric box, and still uses the old text `View >` button (line 2033) instead of `<NotebookInspectIcon />`. | Add a segmented view toggle (`Quality Evaluations` vs. `Machine Checks`), condense the 5-star rubric into a single inline pill bar, and replace `View >` with `<NotebookInspectIcon />` for visual consistency. |
| **7. `DataTable` Pagination Context (`Workspace.tsx:3998–4071`)** | Shows only `Previous 1 2 Next` buttons with no row count context, and only appears when `rows.length > 6`. | Add a clean footer bar showing `"Showing X–Y of Z records"` on the left and compact pagination controls on the right, plus a page-size selector (`6` / `12` / `25` rows). |

### 2.3 Understanding Summary & Non-Functional Requirements (NFRs)

- **What is being built:** A resilient local dev/proxy setup that prevents `/api/v1/health` 500 errors and broken Tailwind CSS across team machines, paired with a focused UI and table simplification pass across `Workspace.tsx` and `workspace.css`.
- **Why it exists:** Team members need `start.bat` / `npm run dev` to render identically without 500 proxy crashes when Docker is starting or offline, and Operators/Evaluators/Superadmins need scannable 5-column tables and single-table views instead of scrolling through 3–5 stacked tables per tab.
- **Target users:** Developers on the SproutSync team, plus Superadmin, Operator, and Evaluator end users.
- **Non-Functional Requirements (NFRs):**
  - **Resilience / Availability:** Frontend dev server (`localhost:5173`) must remain 100% functional and error-free in the console even when `127.0.0.1:8000` (FastAPI) is stopped or restarting.
  - **Performance & Visual Density:** Maximum 5–6 columns per primary operational table (`Batch Production`, `Accounts`, `Evaluations`) and at most 1 primary data table visible per tab viewport via segmented view switchers.
  - **Accessibility:** Maintain WCAG AA contrast, 44px touch targets on mobile, `:focus-visible` outlines, and `aria-label` attributes on all icon-only action buttons.
- **Assumptions:**
  1. The teammate experiencing `App.tsx:391` is running an older local checkout or cached bundle and needs both a repo-level proxy/launcher safeguard and a quick Git + npm sync checklist.
  2. Existing RBAC rules, Supabase RPC calls, and modals in `Workspace.tsx` must remain 100% intact while simplifying the layout and tables.

### 2.4 Decision Log

| Decision | Alternatives Considered | Why This Option Was Chosen |
| :--- | :--- | :--- |
| **1. Intercept `ECONNREFUSED` in `vite.config.ts` proxy instead of removing `/api` proxy** | Remove `/api` proxy or require Docker for frontend dev | Intercepting proxy errors in `vite.config.ts` keeps live FastAPI calls working when Docker is up while returning clean `200`/`503` JSON when Docker is down—eliminating the noisy browser `500 (Internal Server Error)` in all branches. |
| **2. Reduce `batchTable` from 8 columns to 5 columns by stacking `Batch + Crop` and merging `Stage + Status`** | Hide `Target harvest` or `Quality Rating` | `Quality Rating`, `Stage`, and `Target Harvest` are core to daily decisions. Stacking `Seed type` under `Batch code` and showing `Archived` only when `status === "archived"` saves 3 columns without losing a single piece of data. |
| **3. Use segmented pill toggles (`Schedules | Watering Log | Batch Totals` and `Equipment | Evaluator Access`)** | Keep 3–5 tables stacked vertically or add more sidebar tabs | Adding more sidebar tabs violates the 5–6 goal-based navigation limit in `docs/design-brief.md`, while segmented toggles inside a tab keep related records together without vertical clutter. |

## 3. Scope (`@concise-planning`)

- **In Scope:**
  - `frontend/dashboard/vite.config.ts` (graceful proxy error handler for `/api/v1/health` and `/api/*`).
  - `start.bat` & `scripts/start-dev.ps1` (verify `@tailwindcss/vite`, clear stale `.vite` cache, check Docker health before opening browser).
  - `frontend/dashboard/src/styles.css` & `frontend/dashboard/src/workspace.css` (remove conflicting legacy `.workspace-*` CSS, add segmented pill toggle and compact 5-column table styles).
  - `frontend/dashboard/src/components/Workspace.tsx` (5-column `batchTable`, compact Overview header & collapsible tracking map, fix `navigate("serials")` and `navigate("irrigation")` bugs, segmented table views for `Irrigation`, `Evidence`, and `Chamber & Access`, and enhanced `DataTable` footer).
- **Out of Scope:**
  - Modifying database migrations (`backend/api/migrations/`), ESP32 firmware (`iot/`), or Flutter mobile code (`mobile/`).

## 4. Atomic Action Items & Verification (`@concise-planning` + `@plan-writing`)

- [ ] **Task 1: Harden Vite `/api` Proxy Against Offline Backend `500` Errors (`frontend/dashboard/vite.config.ts`)**
  - **Action:** Update `server.proxy['/api']` in `frontend/dashboard/vite.config.ts` to use `{ target: 'http://127.0.0.1:8000', changeOrigin: true, configure: (proxy) => { ... } }` so `proxy.on('error', (err, req, res) => ...)` catches `ECONNREFUSED` and returns HTTP `200` `{"status":"offline","service":"sproutsync-api-offline"}` for `/api/v1/health` and HTTP `503` `{"detail":"Backend API unreachable"}` for other `/api/*` routes instead of Vite's default `500 Internal Server Error`.
  - **Verify:** Stop Docker (`docker compose stop api`), run `npm run dev -w @sproutsync/dashboard`, and run `curl -i http://127.0.0.1:5173/api/v1/health` → returns HTTP `200` JSON with zero `500` errors in console.

- [ ] **Task 2: Upgrade `start.bat` & `scripts/start-dev.ps1` to Prevent Broken Tailwind v4 UI on Teammate Machines**
  - **Action:**
    1. In `start.bat`, add a dependency check for `node_modules\@tailwindcss\vite` (and `frontend\dashboard\node_modules\.vite` cache cleanup when dependencies update) so teammates pulling the repo automatically install the Tailwind v4 Vite plugin.
    2. Add a quick `http://localhost:8000/api/v1/health` readiness poll in `start.bat` after `docker compose up --build -d` and print a clear warning if `.env` is missing `POSTGRES_PASSWORD` or `DATABASE_URL`.
    3. Share the 4-line teammate recovery command (`git pull && npm install && npx vite --force`) to replace their stale 391-line `App.tsx`.
  - **Verify:** Run `node scripts/verify-repository.mjs` and test `start.bat` syntax → exits `0`.

- [ ] **Task 3: Clean Up Conflicting Legacy CSS & Add Compact Table/Segmented Pill Styles (`styles.css` & `workspace.css`)**
  - **Action:**
    1. In `frontend/dashboard/src/styles.css`, remove the unused legacy prototype `.workspace-shell` / `.workspace-sidebar` / `.metric-grid` overrides (lines 193–344) that bloat the stylesheet and conflict with `workspace.css`.
    2. In `frontend/dashboard/src/workspace.css`, add `.segmented-tabs` (compact pill switcher for multi-table views), tighten `.record-table th, .record-table td` padding (`12px 14px`), and style `.table-footer-bar` (left record count summary + right page-size & pagination buttons).
  - **Verify:** Run `npm run build -w @sproutsync/dashboard` → CSS bundles cleanly with zero warnings.

- [ ] **Task 4: Streamline `Overview` Above-the-Fold Banner & Fix Broken Navigation Links (`Workspace.tsx`)**
  - **Action:**
    1. In `frontend/dashboard/src/components/Workspace.tsx` (`page === "home"`), combine `welcome-panel` and `role-brief` into a single compact header card, and add a `"Show 5-step tracking guide"` toggle button so `<ol className="tracking-map">` can be collapsed to bring KPI cards and `Recent batches` above the fold.
    2. Fix the Superadmin `"Granted serial IDs"` KPI card (line 1107) from `onClick={() => navigate("serials")}` to `onClick={() => { setAccountRoleFilter("operator"); navigate("accounts"); }}`.
    3. Fix `"View readings"` on `Current conditions` (line 1216) to call `navigate("readings")` (removing the redundant `dialog?.kind === "readings"` modal), and fix `"View irrigation"` (line 1305) to call `navigate(evaluator ? "readings" : "irrigation")`.
  - **Verify:** Click every KPI card and action link on `Overview` across Superadmin, Operator, and Evaluator roles → each lands on a valid, populated tab.

- [ ] **Task 5: Simplify `batchTable` from 8 Columns to 5 High-Signal Columns (`Workspace.tsx`)**
  - **Action:** Refactor `batchTable` in `frontend/dashboard/src/components/Workspace.tsx` (lines 461–542) from 8 columns (`Batch`, `Owner`, `Crop`, `Stage`, `Status`, `Quality Rating`, `Target harvest`, `Actions`) to **5 columns**:
    1. **`Batch & Crop`**: Renders `<strong>{b.code}</strong>` with a muted sub-line `{b.seed_type}` (plus `· Operator #{b.owner_id}` when viewed by Superadmin or Evaluator).
    2. **`Stage`**: Clickable `<Status value={b.stage} />` badge (plus a subtle `Archived` pill only when `b.status === "archived"`).
    3. **`Quality Rating`**: Inline `<Rating value={avgRating} />` or `+ Rate batch` button for Evaluators.
    4. **`Target Harvest`**: Formatted date (`date(b.target_harvest_at)`).
    5. **`Inspect`**: Accessible `<NotebookInspectIcon size={18} />` button opening `batch-details`.
  - **Verify:** Open `Batch Production` / `Batch Evaluations` at `1280px` width → all 5 columns fit comfortably with zero horizontal scrollbar.

- [ ] **Task 6: Replace Multi-Table Stacks in `Irrigation`, `Evidence`, and `Chamber & Access` with Segmented Views (`Workspace.tsx`)**
  - **Action:**
    1. **`page === "irrigation"` (lines 1803–1887):** Add a `irrigationTab` state (`"schedules" | "history" | "totals"`) with a `.segmented-tabs` pill bar so Operators switch cleanly between `Irrigation Schedule`, `Watering History`, and `Water Use by Batch` inside a single surface.
    2. **`page === "evidence"` (lines 1888–2041):** Add an `evidenceTab` state (`"evaluations" | "checks"`) with a compact inline 5-star rubric strip, and replace the legacy `View <ChevronRight />` button (line 2033) with `<NotebookInspectIcon size={18} />`.
    3. **`page === "system"` (lines 2563–2763):** Promote `Pending Evaluator Requests` to a top callout banner when `accessRequests.length > 0`, and add a `systemTab` state (`"equipment" | "evaluators"`) to separate `Sensors & Maintenance` from `My Evaluators`.
  - **Verify:** Navigate through `Irrigation & Water`, `Evidence & Checks`, and `Chamber & Access` → each tab displays at most 1 table at a time with instant pill switching.

- [ ] **Task 7: Upgrade `DataTable` with Row Count Summary & Page-Size Selector (`Workspace.tsx`)**
  - **Action:** Update `DataTable` in `frontend/dashboard/src/components/Workspace.tsx` (lines 3998–4071) to display a bottom bar with `"Showing {start}–{end} of {rows.length}"`, a compact rows-per-page selector (`6` / `12` / `24`), and pagination buttons that automatically reset to Page 1 whenever `rows.length` changes.
  - **Verify:** Filter batches or readings in `Workspace.tsx` → footer accurately updates `"Showing 1–6 of X"` and pagination buttons work via keyboard and mouse.

- [ ] **Task 8: End-to-End Typecheck, Build & Browser Verification (`Phase X: Verification`)**
  - **Action:** Run repository verification gates:
    1. `npm run typecheck -w @sproutsync/dashboard`
    2. `npm run build -w @sproutsync/dashboard`
    3. `pytest backend/api/tests -q`
    4. `node scripts/verify-repository.mjs`
  - **Verify:** All 4 commands exit `0` with zero TypeScript, build, or test errors.

## 5. Done When (`@plan-writing`)

- [ ] Running the frontend with Docker stopped (`npm run dev`) produces **zero** `500 (Internal Server Error)` responses on `/api/v1/health` or `/api/*`, and `start.bat` verifies `@tailwindcss/vite` so Tailwind v4 styles always load on teammate machines.
- [ ] `batchTable` renders 5 clean columns instead of 8, with zero horizontal overflow on standard desktop screens.
- [ ] `Overview` merges the welcome/role banners, makes the 5-step tracking map collapsible, and fixes the broken Superadmin `"Granted serial IDs"` and `"View irrigation"` / `"View readings"` links.
- [ ] `Irrigation & Water`, `Evidence & Checks`, and `Chamber & Access` use segmented pill toggles instead of stacking 3–5 tables vertically.
- [ ] `npm run typecheck`, `npm run build`, and `pytest` pass with 0 errors.

## 6. Open Questions & Understanding Lock (`@brainstorming`)

1. **Batch Table Columns (5 vs. 6):** Are you happy with merging `Crop` (`seed_type`) as a subtitle under `Batch` (`code`) and showing `Archived` as a secondary pill inside the `Stage` column (giving 5 clean columns: `Batch & Crop`, `Stage`, `Quality Rating`, `Target Harvest`, `Inspect`), or would you prefer keeping `Crop` as its own 6th column?
2. **Multi-Table Tabs (`Irrigation`, `Evidence`, `Chamber & Access`):** Do you prefer the proposed **segmented pill toggle** (showing 1 table at a time per tab), or would you rather keep them stacked vertically inside **collapsible accordion cards**?

> **Understanding Lock Confirmation:** Does this accurately reflect your intent? Please confirm or correct anything before we move to implementation.
