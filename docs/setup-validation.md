# Setup validation - October 29, 2026

Local evidence for the clone/setup repair. Runtime on this Windows machine:
Node 24.18.0 and Python 3.14.6. The documented Docker/CI baseline remains
Node 22 and Python 3.12; other operating systems were not executed here.

Passed:

- `npm ci`: clean locked workspace installation; audit reported zero vulnerabilities.
- Native `python -m pip install -r requirements.txt`; `python -m pip check`.
- `npm run test:setup`: 7 environment validation tests.
- `npm run check:setup -- --docker`: existing configuration passes; optional API
  SMTP warning remains because no sender credentials are configured.
- `npm run test:setup:browser`: isolated real browser confirms missing-config
  recovery UI, favicon HTTP 200, and JSON HTTP 503 for unreachable health/auth.
- `npm run test:browser -w @sproutsync/dashboard`: all 7 mocked workspace flows.
  Updated stale navigation labels, dialog locators, and the required device grant
  in the operator fixture; application access rules were preserved.
- `npm run build`: TypeScript and production Vite bundle.
- `python -m pytest backend/api/tests -q`: 25 tests, including shallow container
  paths, root dotenv/BOM handling, no startup schema mutation, missing-SMTP
  recovery, full offline PostgreSQL migration SQL, and checkout paths with spaces.
- `python -m ruff check backend/api`, repository verifier, and `git diff --check`.
- Compose/workflow YAML parsing, PowerShell launcher AST parsing, entrypoint shell syntax.
- Read-only `python -m app.check_setup`: configured Supabase database is reachable
  and has the required Auth schemas/functions/roles.
- Read-only Alembic `current`: database is at `0010_verification_attempts`;
  checked-in head is `0012_role_hierarchy_access_requests`. No hosted migrations,
  account changes, or schema changes were applied during this task.

Remaining validation / administration:

- Docker CLI/Engine is unavailable on this machine. A real container build,
  Compose interpolation/health wait, and fresh Supabase migration execution were
  not run. SQL compilation and YAML parsing do not substitute for those checks.
- Apply the pending migrations to the intended development project through the
  documented Compose/native startup workflow. Coordinate shared database upgrades
  and backup first. The migration environment widens a narrow revision column
  without changing the existing revision IDs; Alembic `current` stays read-only.
- Real Google login, Supabase Auth email delivery, and API Gmail delivery were not
  tested. Optional Gmail sender credentials remain blank; API OTP requests now
  return 503 instead of claiming an email was sent.
- macOS/Linux execution, Python 3.12 CI, native mobile builds, firmware compilation,
  deployed hosting, and hardware bench checks were not run in this task.
- The installed Starlette/FastAPI test client emits a deprecation warning about
  httpx; the documented test suite passes. No new httpx2 dependency is required by
  the application's current imports.

The local ignored `.env` was supplemented with missing documented optional keys
and the frontend origin. Existing database and Supabase credentials were preserved.
See **[SETUP.md](../SETUP.md)** for current instructions.

---

The following is historical evidence from the initial scaffold, not current
setup instructions:

# Setup validation — October 20, 2026

- Passed: npm dependency installation and package-lock.json generation.
- Passed: dashboard TypeScript check and Vite production build (29 modules).
- Passed: node scripts/verify-repository.mjs.
- Passed: local browser smoke check for the responsive landing page and sign-up dialog.
- Passed: local Git initialization on main; no remote or initial commit.
- Not run: API Ruff/pytest, because installed Python/py entries are unusable Windows aliases. Install Python 3.12+ or run the configured CI job.
- Not run: Docker Compose execution, because Docker is unavailable.
- Not run: PlatformIO firmware compilation, because PlatformIO is unavailable. CI includes compilation.
- Not run: GitHub CI, hardware bench tests, database/MQTT integration or UAT. These are not implemented or require external setup.

The dashboard health indicator was verified in local preview mode with the API stopped; when the API is unavailable, the page remains usable and reports the fallback state. Start the API or Compose stack to verify the green “System ready” state.

Technical references consulted: [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/) and [PlatformIO ESP32 board configuration](https://docs.platformio.org/en/stable/boards/espressif32/esp32dev.html). The project stack and domain scope come from the user-supplied SDP. The public prototype was inspected on October 20, 2026; the dashboard landing slice follows its content structure and responsive visual direction.
