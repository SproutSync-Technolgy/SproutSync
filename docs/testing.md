# Validation strategy

Backend deployment checks: `python scripts/check_backend.py --base-url
http://127.0.0.1:8000` checks liveness, database/schema readiness, Swagger/OpenAPI
and anonymous access denial using GET requests. Optional session-token checks
exercise authorized reads and superadmin connection diagnostics. See the
[API and deployment guide](backend-api-and-deployment.md) for token handling,
the distinction between endpoint success and live hardware, and complete scope.
Isolated monitoring/schema/checker tests run with the API suite without contacting
Supabase, SMTP or MQTT.

Linux launcher checks: `python3 scripts/test_linux_launchers.py -v` runs on Linux
with Bash, flock, Node.js 22.12+, and Python 3.12+. Isolated fixtures simulate
package installation and database checks while serving real loopback HTTP. They
verify repeated start/stop, dependency reuse and damaged-package repair, read-only
verification, stale process identities, unrelated ports, and cleanup after a
dashboard failure. They never contact the configured Supabase or MQTT services.
The `linux-launchers` CI job checks shell syntax, executable permissions, and
these scenarios on Ubuntu. They are skipped on Windows rather than claiming a
Linux runtime check there.

Windows launcher checks: `npm run test:dependencies` tests missing/changed npm
packages and lockfiles. `scripts/test-native-launcher.ps1` checks API lifecycle,
explicit shutdown, and stale PID protection without using the database or broker.
`scripts/test-first-run.ps1` installs a clean Python environment under `.tools`,
verifies a second run skips installation, and removes only that test directory.
`scripts/test-local-run.ps1` exercises the real `start.bat`/`stop.bat` flow against
the configured development database and leaves both services stopped. Run these
PowerShell scripts with `-NoProfile -ExecutionPolicy Bypass -File`; the policy
change applies only to that child process. `verify.bat` is a read-only inventory,
not a substitute for tests or a production build.

Current checks: locked npm installation, setup environment validation/tests,
dashboard type checking/build, isolated browser setup smoke, workspace browser
flows, Python installation/pip check, Ruff, API health/permissions/verification
tests, and offline PostgreSQL migration SQL generation. Commands and prerequisites
are in [SETUP.md](../SETUP.md). CI also compiles ESP32 firmware; a workflow file
does not prove the hosted CI has run.

Use a dedicated development Supabase project for actual migration integration.
The setup prerequisite checker and Alembic `current` inspect that database without
upgrading it. SQLite API tests and SQL generation do not establish that a fresh
Supabase/PostgreSQL migration ran successfully. SMTP and real OAuth/email delivery
require separate integration checks. Record local verification outcomes in
[setup validation](setup-validation.md).

Next tests: persistence across API restarts; rejected unauthorized access; MQTT schema validation and duplicate replay; WebSocket reconnect and stale telemetry; water/yield units and calculations; ESP32 network loss, sensor failure, maximum pump runtime, sequential valve operation, SD-full and power loss. Validate limits against actual hardware.

Adaptive telemetry checks cover sample-weighted means, missing/zero values,
fault-minute transitions, gap handling, restart state, bounded accumulators and
duplicate message rejection. `scripts/verify_adaptive_workflows.py` verifies
multiple evaluator grants, safe approval retries, snapshot RLS and private-state
restrictions with synthetic PostgreSQL fixtures in an outer rollback. Apply
0023 first; `--pending` can instead validate 0022/0023 transactionally from 0021.
It never publishes MQTT commands or changes real-user grants. Browser checks
cover hosted RPC fallback, API timeouts, six-sensor mobile cards, fresh faulting
devices, current-minute previews and labelled five-minute history.

Wireless discovery tests cover explicit mDNS identities, local address filtering,
expired selections, role/ownership checks, first-device registration, MQTT serial
requirements, topic conflicts, mobile layout, Bluetooth identity reads and
cancellation, unavailable Bluetooth, and multicast failure feedback. Browser
Bluetooth tests use a mocked GATT device; they do not establish physical pairing.
`scripts/verify_mqtt_persistence.py` verifies the wireless serial flag and browser
write restrictions against PostgreSQL in a rolled-back transaction. Build the
optional ESP32-WROOM discovery example with `pio run --project-dir iot/esp32 -e discovery`;
actual Wi-Fi announcements, Bluetooth reads, and sensor telemetry require a
separate hardware integration check with the team's sensor firmware.

Bench hardware with actuators isolated before energized tests. Record firmware revision, wiring, calibration, inputs and observed outputs. Firmware compilation alone does not establish safety.

UAT should trace each SDP objective to an acceptance case and evidence: batch traceability, rinse automation, environmental monitoring, fault detection, water usage and yield. Log tester, date, commit, setup, expected/actual results and outcome. Do not substitute simulated data for measured results.

