# Validation strategy

Current automated checks: dashboard type checking and production build; API health contract test and Ruff; ESP32 compilation in CI. CI has not run until the repository is pushed to GitHub.

Next tests: persistence across API restarts; rejected unauthorized access; MQTT schema validation and duplicate replay; WebSocket reconnect and stale telemetry; water/yield units and calculations; ESP32 network loss, sensor failure, maximum pump runtime, sequential valve operation, SD-full and power loss. Validate limits against actual hardware.

Bench hardware with actuators isolated before energized tests. Record firmware revision, wiring, calibration, inputs and observed outputs. Firmware compilation alone does not establish safety.

UAT should trace each SDP objective to an acceptance case and evidence: batch traceability, rinse automation, environmental monitoring, fault detection, water usage and yield. Log tester, date, commit, setup, expected/actual results and outcome. Do not substitute simulated data for measured results.

