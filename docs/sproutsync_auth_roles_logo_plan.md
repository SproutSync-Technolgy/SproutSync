# SproutSync Auth, Role Hierarchy & Logo Implementation Plan (`SproutSync-Amaro`)

> **Target Execution Environment:** Antigravity IDE (`gemini-flash-3.8`) + `aas-skills-mcp` & `github-mcp-server`
> **Project Root Plan Slug:** `sproutsync-auth-roles-logo-plan.md`
> **Skills Integrated:** `@brainstorming` (Understanding Lock, NFRs, Decision Log) · `@concise-planning` (Scope & Atomic Checklist) · `@plan-writing` (Task-to-Verification Mapping)

## 1. Goal & Approach (`@concise-planning` + `@plan-writing`)

**Goal:** Professionally connect Supabase Authentication (both **Google OAuth** and **Email/Password Sign In + Sign Up**) across the frontend and FastAPI backend in `SproutSync-Amaro`, restore the split-screen **Sign In / Sign Up UI** from the Figma Prototype, set the default new-user role to **`"evaluator"`**, flip the dashboard UI hierarchy so **Operator** gets the full technical/admin-grade dashboard (`TechnicalAdminHome` + operational controls) while **Evaluator** is the tier below (`GrowerUserHome` / read-only views), and make the `Logo` transparent and larger across all headers and sidebars.

**High-Level Approach:**
1. **Backend Default Role (`"evaluator"`) & Auth Sync:** Update `User.role` in `backend/api/app/models.py` and `backend/api/app/auth.py` so newly projected Supabase users (via Google SSO or Email/Password Sign Up) default to `role="evaluator"`, and add an Alembic migration (`0003_default_evaluator_role.py`) to set the column `server_default="evaluator"`.
2. **Restore Prototype Sign In / Sign Up UI (`ProtoAuth.tsx`):** Instead of having Landing page `"Sign in"`, `"Sign up"`, and `"Get started"` buttons immediately redirect to Google OAuth, restore the Prototype's split-screen `Auth` view (`mode: 'login' | 'register'`), wired to **real** `supabase.auth.signInWithPassword`, `supabase.auth.signUp` (passing `full_name` in `options.data`), and `supabase.auth.signInWithOAuth({ provider: 'google' })` with inline error/confirmation feedback and reactive `supabase.auth.onAuthStateChange` session synchronization in `App.tsx`.
3. **UI Role Hierarchy (`Operator` = Top Operational Admin Tier, `Evaluator` = Lower Read-Only Tier):** Update `ProtoGrowerDashboard.tsx` and `prototypeFixtures.ts` so:
   - **`operator`** (and `admin`) is the higher operational tier: renders `TechnicalAdminHome` on `Overview` (with the 6 live sensor sparklines, 7-day `WaterUseChart`, batch pipeline, system alerts, and stage donut) and has access to all operational tabs (`Overview`, `Batches` with `+ New batch`, `Irrigation`, `Alerts` with Acknowledge, `Reports`, `Acceptance evidence`, `Maintenance`, `Operational logs`).
   - **`evaluator`** is the default lower tier: renders the simplified `GrowerUserHome` on `Overview` and has read-only access (`Overview`, `Batches`, `Irrigation`, `Alerts`, `Reports`, `Acceptance evidence` — without batch creation, alert acknowledgement, maintenance, or operational logs).
4. **Transparent, Larger Logo (`Logo` in `ProtoPrimitives.tsx` & `logo.png`):** Remove the solid `bg-white`, `rounded-xl`, and `p-0.5` wrapper in `Logo` (`ProtoPrimitives.tsx`), increase its default size from `h-9 w-9` (36px) to `h-12 w-12` (48px), and auto-crop the 25% transparent border margin inside `frontend/dashboard/src/assets/logo.png` so the sprout mark renders crisp, large, and 100% transparent on both the light navbar (`#F4FBF6`) and dark sidebar (`#0F2A1D`).

## 2. Recommended Skills from `aas-skills-mcp` (`mcp_config.json`)

When executing this plan in Antigravity with **Gemini Flash 3.8**, load these skills from `aas-skills-mcp`:

| Skill Name | Purpose in This Task | Execution Phase |
| :--- | :--- | :--- |
| `concise-planning` | Maintain the atomic checklist and scope boundaries during implementation | Pre-flight & Tracking |
| `brainstorming` | Lock in the auth flows, `"evaluator"` default role, and `Operator > Evaluator` UI hierarchy | Pre-flight Gate |
| `plan-writing` | Enforce 2–5 minute atomic tasks with immediate CLI/browser verification | All Implementation Tasks |
| `executing-plans` | Execute this written plan step-by-step with verification checkpoints | Execution Loop |
| `supabase-auth` / `fastapi-security` | Wire `supabase.auth.onAuthStateChange`, `signInWithPassword`, `signUp`, `signInWithOAuth`, and FastAPI `/auth/v1/user` projection | Tasks 1, 3, & 4 |
| `frontend-design` / `tailwind-design-system` | Restore split-screen `ProtoAuth.tsx` UI and fix `Logo` transparency & sizing | Tasks 2 & 3 |
| `react-best-practices` / `typescript-strict` | Ensure strict React 19 + TypeScript `~5.9.3` (`tsc --noEmit`) compliance | Tasks 2–6 |
| `verification-before-completion` | Run `npm run typecheck`, `npm run build`, `python -m compileall`, and `node scripts/verify-repository.mjs` | Task 7 (Final Verification) |

## 3. Brainstorming & Understanding Lock (`@brainstorming`)

### 3.1 Root-Cause Diagnosis of `SproutSync-Amaro`

| Issue Reported | Root Cause Found in `SproutSync-Amaro` Codebase | Target Fix |
| :--- | :--- | :--- |
| **1. Sign Up UI is missing & Auth is not professionally connected** | In `src/App.tsx`, `handleGetStarted()` calls `supabase.auth.signInWithOAuth({ provider: 'google' })` directly. `ProtoLanding.tsx` passes `onGetStarted` to `"Sign in"`, `"Sign up"`, and `"Get started"`, bypassing any Sign In / Sign Up screen. Furthermore, `App.tsx` only runs a one-time `useEffect` fetch to `/api/v1/auth/me` and does not subscribe to `supabase.auth.onAuthStateChange`, nor does it handle PKCE/OAuth callback loading states or Email/Password login/registration. | Create `src/components/ProtoAuth.tsx` (porting the Prototype's split-screen `Auth` component with `login` and `register` modes). Wire `"Sign in"` → `ProtoAuth (mode="login")` and `"Sign up"` / `"Get started"` → `ProtoAuth (mode="register")`. Connect Email/Password (`signInWithPassword`, `signUp`) and Google SSO (`signInWithOAuth`), plus `supabase.auth.onAuthStateChange` in `App.tsx`. |
| **2. Default user role must be `"Evaluator"`** | In `backend/api/app/models.py` (line 22), `role: Mapped[str] = mapped_column(String(32), default="operator")`. In `frontend/dashboard/src/data/prototypeFixtures.ts` (line 125), `normalizeAccountRole` falls back to `'operator'` when `apiRole` is empty or unrecognized. | Change default role to `"evaluator"` in `backend/api/app/models.py`, `backend/api/app/auth.py` (explicit `role="evaluator"` on new `User` creation), add migration `0003_default_evaluator_role.py`, and set `'evaluator'` as the default fallback in `normalizeAccountRole()`. |
| **3. UI Role Hierarchy: Operator is the Admin/Top tier, Evaluator is below that** | In `ProtoGrowerDashboard.tsx` (line 532), `active === 'home'` has the condition inverted: `role === 'operator' ? <GrowerUserHome /> : <TechnicalAdminHome />`, which gave `evaluator` the technical admin overview and `operator` the simplified home! Also, `NAV_ALL` hid `Acceptance evidence` from `operator`. | Flip the hierarchy in `ProtoGrowerDashboard.tsx` and `prototypeFixtures.ts`: **`operator`** (and `admin`) renders `<TechnicalAdminHome />` on `Overview` and gets full operational access (including `Acceptance evidence`, `Maintenance`, `Operational logs`, `+ New batch`, and alert acknowledgement). **`evaluator`** is the lower read-only tier and renders `<GrowerUserHome />` on `Overview`. |
| **4. Logo is not transparent and is too small** | In `ProtoPrimitives.tsx` (line 26), `Logo` wraps `<img src={logoUrl} />` inside `<span className="grid place-items-center overflow-hidden rounded-xl bg-white h-9 w-9">` with `p-0.5`. Additionally, `logo.png` (`384×384`) has transparent padding around the graphic (`bbox: 86,57 to 292,327`), making the actual sprout icon look tiny inside a white square box. | Remove `bg-white`, `rounded-xl`, and `p-0.5` from `Logo` in `ProtoPrimitives.tsx`, change default class to `h-12 w-12` (`48px`), and trim the excess transparent padding from `src/assets/logo.png` (and `docs/assets/logo.png`) so the transparent PNG fills its container cleanly. |

### 3.2 Understanding Summary

- **What is being built:** End-to-end Supabase Google OAuth + Email/Password Sign In & Sign Up integration with a restored split-screen Auth UI, default `"evaluator"` role assignment on account creation, corrected `Operator > Evaluator` dashboard hierarchy, and a larger, truly transparent brand logo.
- **Why it exists:** New users signing up via Email or Google SSO should enter as `Evaluator` (read-only tier below `Operator`), while promoted `Operator` accounts act as the operational admin tier with full technical telemetry and controls.
- **Who it is for:** Evaluators (default sign-up role), Operators (operational admin tier), and System Administrators (`/admin`).
- **Key constraints:**
  1. Keep `/admin` (`Workspace role="admin"`) intact.
  2. Default every newly registered user (via Google OAuth or Email/Password Sign Up) to `role = "evaluator"` in PostgreSQL/Supabase and frontend fallback.
  3. Ensure `Operator` is the higher UI tier (`TechnicalAdminHome` + full tabs/actions) and `Evaluator` is the lower UI tier (`GrowerUserHome` + read-only tabs).
  4. Make the `Logo` component transparent (`bg-transparent`) and visibly larger across Landing, Auth, Dashboard Sidebar, and Mobile Frame.
- **Explicit non-goals:**
  - Allowing public users to self-select `"operator"` or `"admin"` during sign-up (new accounts always start as `"evaluator"`).

### 3.3 Non-Functional Requirements (NFRs)

- **Authentication & Session Lifecycle:** `supabase.auth.onAuthStateChange` must synchronize the browser session with `/api/v1/auth/me` automatically on sign-in, sign-up, token refresh, OAuth redirect return, and sign-out—without stale state or flash of unauthenticated content.
- **Security:** Never expose role self-elevation on public sign-up; backend `get_current_user` enforces `role="evaluator"` for all newly created `User` rows.
- **Visual Polish:** Cropping transparent dead-space from `logo.png` and removing `bg-white` ensures the logo scales crisply on both light (`#F4FBF6`) and dark (`#0F2A1D` / emerald gradient) surfaces.

### 3.4 Decision Log

| Decision | Alternatives Considered | Why This Option Was Chosen |
| :--- | :--- | :--- |
| **1. Restore split-screen `ProtoAuth.tsx` with `login` and `register` modes** | Use a small modal dialog on the Landing page | The Figma Prototype features a dedicated split-screen `Auth` page (`Fresh sprouts, zero guesswork` brand panel + Sign In / Create Account form + `Continue with Google`). Restoring it satisfies *"restore the Sign Up UI"* with the exact prototype look. |
| **2. Support both Supabase Email/Password (`signInWithPassword` / `signUp`) and Google OAuth (`signInWithOAuth`)** | Google OAuth only | User requested: *"Connect the backend Supabase SSO google and email properly... and restore the Sign Up UI."* Wiring both methods into `ProtoAuth.tsx` makes the restored Email + Password fields and Google button 100% functional against Supabase Auth. |
| **3. Enforce `"evaluator"` as default role in Backend (`models.py`, `auth.py`, migration `0003`) & Frontend (`normalizeAccountRole`)** | Set role in frontend metadata only | Setting `default="evaluator"` in SQLAlchemy + Alembic ensures every new user authenticated via Supabase (Google or Email) is persisted in PostgreSQL as `"evaluator"` until promoted to `"operator"` or `"admin"`. |
| **4. Map `operator` → `TechnicalAdminHome` (full tabs/actions) and `evaluator` → `GrowerUserHome` (read-only tier)** | Keep `operator` on `GrowerUserHome` | User explicitly specified: *"For the UI its different Operator is the admin and the Evaluator is the below that."* |
| **5. Trim transparent padding in `logo.png` AND remove `bg-white` / increase size in `Logo`** | Only change CSS width/height | `logo.png` currently has ~25% empty margin around the artwork AND a hardcoded `bg-white` class in `ProtoPrimitives.tsx`. Fixing both removes the white box and makes the sprout icon substantially larger and cleaner. |

## 4. Scope Definition (`@concise-planning`)

- **In Scope:**
  - **Backend (`backend/api/app/`):** Update `User.role` default to `"evaluator"` in `models.py` and `auth.py`, handle display name from Supabase `user_metadata` (`full_name` / `name`), and add migration `0003_default_evaluator_role.py`.
  - **Logo Asset & Component (`src/assets/logo.png`, `src/components/ProtoPrimitives.tsx`):** Auto-crop excess transparent border around `logo.png` (preserving RGBA alpha transparency), remove `bg-white rounded-xl` and `p-0.5` from `Logo`, and bump default size from `h-9 w-9` to `h-12 w-12`.
  - **Role Hierarchy (`src/data/prototypeFixtures.ts`, `src/components/ProtoGrowerDashboard.tsx`):** Default `normalizeAccountRole` to `'evaluator'`, grant `operator` full tabs (`NAV_ALL` including `evidence`, `maintenance`, `support`) and `TechnicalAdminHome` on `Overview`, and place `evaluator` on `GrowerUserHome` (read-only tier).
  - **Sign In / Sign Up UI & Supabase Session Flow (`src/components/ProtoAuth.tsx`, `src/components/ProtoLanding.tsx`, `src/components/ProtoMobileApp.tsx`, `src/App.tsx`):** Restore split-screen Sign In / Sign Up UI wired to Supabase Email/Password + Google OAuth, and manage session lifecycle via `supabase.auth.onAuthStateChange` + `/api/v1/auth/me`.
- **Out of Scope:**
  - Changing `/admin` (`Workspace role="admin"`) mechanics.
  - Hardware/ESP32 live MQTT changes.

## 5. Atomic Action Items & Verification (`@concise-planning` + `@plan-writing`)

> **Execution Instruction for Antigravity Gemini Flash 3.8:** Execute Tasks 1 through 7 sequentially. Verify each step before moving to the next.

- [ ] **Task 1: Set Backend Default Role to `"evaluator"` & Improve Supabase User Projection (`backend/api/`)**
  - **Action:**
    1. In `backend/api/app/models.py`, change `User.role` from `default="operator"` to `default="evaluator"`.
    2. In `backend/api/app/auth.py`, when creating a new `User` in `get_current_user`, explicitly pass `role="evaluator"` and resolve `display_name = metadata.get("full_name") or metadata.get("name") or email.split("@")[0]`.
    3. Create `backend/api/migrations/versions/0003_default_evaluator_role.py` (with `down_revision = "0002_batches"`) that alters `users.role` server default to `"evaluator"`.
  - **Verify:** Run `python -m compileall -q backend/api/app backend/api/migrations` → exits `0`.

- [ ] **Task 2: Make `Logo` Transparent and Larger (`src/assets/logo.png` & `src/components/ProtoPrimitives.tsx`)**
  - **Action:**
    1. Crop the excess transparent padding around `frontend/dashboard/src/assets/logo.png` (and `docs/assets/logo.png`) to its non-transparent bounding box with a small 8px breathing margin, keeping RGBA mode `(0, 0, 0, 0)` transparent background.
    2. In `frontend/dashboard/src/components/ProtoPrimitives.tsx`, update `Logo`:
       ```tsx
       export function Logo({ className = 'h-12 w-12' }: { className?: string }) {
         return (
           <span className={`inline-flex shrink-0 items-center justify-center bg-transparent ${className}`}>
             <img src={logoUrl} alt="SproutSync logo" className="h-full w-full object-contain drop-shadow-sm" />
           </span>
         );
       }
       ```
    3. Update header/sidebar brand text alignment in `ProtoLanding.tsx` and `ProtoGrowerDashboard.tsx` (`gap-3`) to pair naturally with the larger transparent logo.
  - **Verify:** Run `npm run typecheck` → exits `0`; inspect `Logo` in `ProtoPrimitives.tsx` to confirm `bg-white` is completely removed.

- [ ] **Task 3: Update UI Role Hierarchy (`Operator` = Admin/Top Tier, `Evaluator` = Default Lower Tier)**
  - **Action:**
    1. In `frontend/dashboard/src/data/prototypeFixtures.ts`:
       - Update `normalizeAccountRole(apiRole?: string | null): Role` so empty/unknown roles default to `'evaluator'` (only `'admin'` maps to `'admin'`, and `'operator'` maps to `'operator'`).
       - Update `ROLE_LABEL` so `operator: 'Operator (Admin)'` (or `'Operator'`) and `evaluator: 'Evaluator'` clearly reflect the hierarchy, and ensure `PERMISSIONS.operator` has full operational capabilities (`runBatch: true`, `ackAlert: true`, `recordMaintenance: true`, `manageServices: true`, `reviewEvidence: true`, `editOwnProfile: true`) while `PERMISSIONS.evaluator` is strictly read-only (`runBatch: false`, `ackAlert: false`, `recordMaintenance: false`, `manageServices: false`, `reviewEvidence: true`, `editOwnProfile: true`).
    2. In `frontend/dashboard/src/components/ProtoGrowerDashboard.tsx`:
       - Ensure `NAV_ALL` includes `'operator'` on all 8 tabs (`home`, `batches`, `water`, `alerts`, `reports`, `evidence`, `maintenance`, `support`) and restricts `'evaluator'` to the read-only tabs (`home`, `batches`, `water`, `alerts`, `reports`, `evidence`).
       - In `active === 'home'`, render `<TechnicalAdminHome />` for `role === 'operator' || role === 'admin'` (giving Operator the rich technical admin overview with 6 sensor sparklines, batch pipeline, and 7-day water chart) and render `<GrowerUserHome />` for `role === 'evaluator'`.
  - **Verify:** Run `npm run typecheck` → exits `0`.

- [ ] **Task 4: Restore Split-Screen Sign In / Sign Up UI (`src/components/ProtoAuth.tsx`)**
  - **Action:** Create `frontend/dashboard/src/components/ProtoAuth.tsx` based on the Figma Prototype's split-screen `Auth` component:
    1. Accept props: `initialMode: 'login' | 'register'`, `onBack: () => void`, `onSuccess: () => void`.
    2. Left brand column: Emerald gradient (`from-emerald-700 to-green-800`), `"Back to home"` button, large transparent `<Logo className="h-16 w-16" />`, headline `"Fresh sprouts, zero guesswork."`, and role hierarchy note.
    3. Right form column:
       - Mode toggle between **Sign In** (`mode === 'login'`) and **Sign Up** (`mode === 'register'`).
       - **"Continue with Google"** button calling `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/' } })`.
       - **Email & Password Form:**
         - In `register` mode: includes `Full name` input, `Email address`, `Password` (min 8 chars), and a clear badge stating: *"New accounts are registered as **Evaluator** (read-only access). Operator access is granted by an administrator."* Calls `supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } })`. Handles both immediate session return and email-confirmation notice gracefully.
         - In `login` mode: includes `Email address` and `Password`. Calls `supabase.auth.signInWithPassword({ email, password })` and invokes `onSuccess()` upon sign-in.
       - Displays loading states (`Signing in…` / `Creating account…`) and inline error/success alerts.
  - **Verify:** Run `npm run typecheck` → `ProtoAuth.tsx` compiles with zero TypeScript errors.

- [ ] **Task 5: Connect Professional Sign In / Sign Up / Sign Out Lifecycle in `App.tsx`, `ProtoLanding.tsx` & `ProtoMobileApp.tsx`**
  - **Action:**
    1. In `frontend/dashboard/src/components/ProtoLanding.tsx`, replace the single `onGetStarted: () => void` prop with `onSignIn: () => void` and `onSignUp: () => void` so clicking **"Sign in"** opens `ProtoAuth` in `'login'` mode, while **"Sign up"** and **"Get started"** open `ProtoAuth` in `'register'` mode.
    2. In `frontend/dashboard/src/App.tsx` (`GrowerEntry`):
       - Track `view: 'landing' | 'auth-login' | 'auth-register' | 'mobileApp'`.
       - Subscribe to `supabase.auth.onAuthStateChange((_event, session) => ...)` in addition to initial session check: whenever `session?.access_token` is present, call `apiFetch('/api/v1/auth/me')` to load the projected `AuthenticatedUser` (with default `role: "evaluator"` for new users) and transition smoothly into `<ProtoGrowerDashboard />`.
       - If `/api/v1/auth/me` is unreachable in offline/standalone preview mode but `session?.user` exists from Supabase, construct a fallback `AuthenticatedUser` from `session.user` with `role: 'evaluator'` so sign-in still works cleanly.
       - In `handleLogout()`, call `await supabase.auth.signOut()`, clear `user` state, and return cleanly to `view = 'landing'`.
    3. In `frontend/dashboard/src/components/ProtoMobileApp.tsx`, wire the mobile login screen's email form and `"Continue with Google"` button to `supabase.auth` (instead of the broken `/api/v1/auth/google` link on line 197).
  - **Verify:** Run `npm run typecheck && npm run build` → exits `0`.

- [ ] **Task 6: Sync Profile Display Name Updates with Supabase User Metadata (`ProtoPrimitives.tsx` & `ProtoGrowerDashboard.tsx`)**
  - **Action:** In `ProtoGrowerDashboard.tsx` (`openProfile`), when the user saves their display name in `ProfileEditor`, call `await supabase.auth.updateUser({ data: { full_name: newName } })` and re-fetch `/api/v1/auth/me` so the updated display name persists across sign-out and sign-in.
  - **Verify:** Run `npm run typecheck` → exits `0`.

- [ ] **Task 7: Full Repository Verification (Phase X: Verification)**
  - **Action:** Run all frontend and backend verification checks from the repository root:
    1. `npm run typecheck`
    2. `npm run build`
    3. `python -m compileall -q backend/api/app backend/api/migrations`
    4. `node scripts/verify-repository.mjs`
    5. `git status` & `git diff --check`
  - **Verify:** All 5 commands exit `0` with zero errors.

## 6. Done When (`@plan-writing`)

- [ ] Clicking **"Sign in"** on the Landing page opens the restored split-screen `ProtoAuth` view in Sign In mode; clicking **"Sign up"** or **"Get started"** opens `ProtoAuth` in Create Account (`register`) mode.
- [ ] Signing up or signing in via **Google SSO** (`supabase.auth.signInWithOAuth`) or **Email & Password** (`supabase.auth.signUp` / `signInWithPassword`) authenticates through Supabase, projects the user via `/api/v1/auth/me`, and transitions reactively into the dashboard.
- [ ] Every newly created user account defaults to **`"evaluator"`** in both PostgreSQL (`models.py` / `auth.py` / migration `0003`) and frontend role normalization.
- [ ] **Operator** accounts render the full admin-grade technical dashboard (`TechnicalAdminHome` on `Overview` + all 8 sidebar tabs + batch creation + alert acknowledgement + maintenance), while **Evaluator** accounts render the lower-tier read-only dashboard (`GrowerUserHome` on `Overview` + read-only tabs).
- [ ] Clicking **Sign out** in the profile menu revokes the Supabase session (`supabase.auth.signOut()`) and returns cleanly to the Landing page.
- [ ] The `Logo` component has no white background box (`bg-transparent`), `logo.png` has its excess transparent border cropped, and the logo renders larger and sharper across the Landing header, Auth screen, Dashboard sidebar, and Mobile simulator.
- [ ] `/admin` (`Workspace role="admin"`) remains intact and `npm run typecheck`, `npm run build`, and `node scripts/verify-repository.mjs` pass.

## 7. Open Questions & Understanding Lock Gate (`@brainstorming`)

1. **Operator vs. Evaluator Overview Screen:** With **Operator** acting as the operational admin tier (`TechnicalAdminHome` with live sensor sparklines, batch pipeline, and 7-day water chart) and **Evaluator** as the tier below (`GrowerUserHome` with simplified greeting banner, condition cards, and read-only tabs), should `Evaluator` still have access to the read-only `Acceptance evidence` and `Reports` tabs in the sidebar, or only `Overview`, `Batches`, `Irrigation`, and `Alerts`?

> **Understanding Lock Confirmation:** Does this plan accurately reflect your intent for Supabase Google + Email Auth, the restored Sign Up UI, the `"evaluator"` default role, the `Operator > Evaluator` hierarchy, and the larger transparent logo?
