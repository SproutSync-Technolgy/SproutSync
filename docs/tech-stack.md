# SproutSync technology stack

For installation commands, required configuration, supported development paths,
and troubleshooting, use **[SETUP.md](../SETUP.md)**. Dependency manifests are
executable sources of truth; do not maintain a second package/version list here.

| Area | Technologies | Manifest / lock |
| --- | --- | --- |
| Web | React 19, React DOM, TypeScript, Vite 7, Tailwind 4, Supabase JS, Lucide, Motion, Recharts | `frontend/dashboard/package.json`, root `package-lock.json` |
| API | Python 3.12+, FastAPI, Uvicorn, SQLAlchemy, psycopg, Alembic, Pydantic Settings, httpx, python-dotenv | `backend/api/pyproject.toml` |
| Python development | pytest, Ruff, Pillow image utility | root `requirements.txt` delegates to API dev/tools extras |
| Authentication/data | Supabase Auth, PostgREST/RPCs, PostgreSQL with RLS | Alembic migrations in `backend/api/migrations/` |
| Browser tests | Playwright | Dashboard manifest and root npm lock |
| Mobile | Flutter, Dart, Supabase Flutter, mobile_scanner | `mobile/pubspec.yaml`, `mobile/pubspec.lock` |
| Firmware | PlatformIO 6.1.18, Arduino, C++ / ESP32 | `requirements-firmware.txt`, `iot/esp32/platformio.ini` |
| Optional infrastructure | PostgreSQL 17, Mosquitto 2 | Compose `infrastructure` profile |

Use Node 22.12+ (CI uses Node 22), Python 3.12 for parity with Docker/CI, and
Docker with Compose v2.20+ for container startup. macOS/Linux and Windows
instructions are maintained together in SETUP.md. Flutter needs platform-specific
SDKs; native iOS builds require macOS/Xcode.

The current browser and mobile clients authenticate and call protected database
RPCs through Supabase. FastAPI verifies bearer tokens against the same project.
Direct PostgreSQL alone does not supply the required Auth schemas, functions,
roles, or HTTP APIs. Google OAuth provider credentials belong in Supabase Auth,
not obsolete session-cookie/Google OAuth environment variables from the scaffold.

The API container installs only runtime Python dependencies. A native development
install also includes test/lint tools and Pillow for `scripts/crop_logo.py`.
Firmware and mobile are optional for web development. No MQTT client or hardware
driver is installed until its actual integration is implemented and validated.
