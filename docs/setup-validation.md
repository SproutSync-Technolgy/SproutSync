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
