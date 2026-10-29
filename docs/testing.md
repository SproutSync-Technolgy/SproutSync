# Validation strategy

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

