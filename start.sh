#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
TOOLS_DIR="$ROOT_DIR/.tools"
STATE_FILE="$TOOLS_DIR/dev-session.pid"
API_PID=
API_STARTED=
DASHBOARD_PID=
DASHBOARD_STARTED=
SESSION_STARTED=0

if [[ "$(uname -s)" != Linux ]]; then
    printf 'These launchers require Linux (Bash and /proc). On Windows use start.bat; on macOS follow docs/setup-reference.md.\n' >&2
    exit 1
fi
source "$ROOT_DIR/scripts/linux-session.sh"

usage() {
    printf 'Usage: ./start.sh [--check | --install-only]\n'
}

if (($# > 1)); then
    usage >&2
    exit 2
fi
case "${1:-}" in
    --check)
        exec bash "$ROOT_DIR/verify.sh"
        ;;
    --install-only| "")
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac

if [[ "${1:-}" != --install-only && -f "$STATE_FILE" ]]; then
    linux_read_session || exit 1
    if linux_launcher_matches; then
        if command -v python3 >/dev/null 2>&1 && python3 - <<'PY' 2>/dev/null
import json
from urllib.request import urlopen

with urlopen("http://127.0.0.1:8000/api/v1/health", timeout=3) as response:
    health = json.load(response)
assert health.get("status") == "ok" and health.get("service") == "sproutsync-api"
with urlopen("http://127.0.0.1:5173", timeout=3) as response:
    assert response.status == 200
PY
        then
            printf '[OK] Existing healthy session reused. No packages installed or services restarted.\n'
            printf 'SproutSync is already running at http://localhost:5173 (API: http://localhost:8000/docs).\n'
            printf 'To reload backend settings, run ./stop.sh and then ./start.sh.\n'
            exit 0
        fi
        printf 'This checkout is starting or unhealthy. Wait for startup, or run ./stop.sh and retry.\n' >&2
        exit 1
    fi
fi

mkdir -p "$TOOLS_DIR"
if ! command -v flock >/dev/null 2>&1; then
    printf 'flock is required for safe startup locking. Install util-linux, then retry.\n' >&2
    exit 1
fi
exec 9>"$TOOLS_DIR/development-start.lock"
if ! flock -n 9; then
    printf 'Another setup or startup is already running for this checkout.\n' >&2
    exit 1
fi

if [[ "${1:-}" != --install-only ]]; then
    for port in 5173 8000; do
        if command -v python3 >/dev/null 2>&1 && python3 - "$port" <<'PY'
import socket
import sys
with socket.socket() as connection:
    connection.settimeout(0.25)
    raise SystemExit(0 if connection.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0 else 1)
PY
        then
            printf 'Port %s is already in use outside a verified healthy session. No processes were stopped. Stop the owning app or checkout, then retry.\n' "$port" >&2
            exit 1
        fi
    done
    if [[ -f "$STATE_FILE" ]]; then
        linux_read_session || exit 1
        # The lock and free ports make removing a stale launcher record safe.
        if linux_launcher_matches; then
            printf 'This checkout already has a launcher. Run ./stop.sh first.\n' >&2
            exit 1
        fi
        rm -f -- "$STATE_FILE"
    fi
fi

node_version="$(node --version 2>/dev/null || true)"
if [[ -z "$node_version" ]] || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
    printf 'Node.js 22.12+ is required. Install or upgrade Node.js, then retry.\n' >&2
    exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
    printf 'npm is missing. Install npm with Node.js, then retry.\n' >&2
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'; then
    printf 'Python 3.12+ is required. Install a supported Python version, then retry.\n' >&2
    exit 1
fi

node_report="$(node scripts/check-node-dependencies.mjs 2>/dev/null || true)"
if [[ -z "$node_report" ]]; then
    printf 'Could not inspect JavaScript dependencies or package-lock.json.\n' >&2
    exit 1
fi
if ! node -e 'const report = JSON.parse(process.argv[1]); process.exit(report.lockValid ? 0 : 1)' "$node_report"; then
    node -e 'const report = JSON.parse(process.argv[1]); for (const problem of report.problems) console.error(`[ACTION] ${problem}`)' "$node_report"
    printf 'Resolve the package manifest/lockfile issue before installing.\n' >&2
    exit 1
fi
if ! node -e 'process.exit(JSON.parse(process.argv[1]).ready ? 0 : 1)' "$node_report"; then
    printf '[INSTALL] Installing locked JavaScript dependencies...\n'
    npm ci
    node_report="$(node scripts/check-node-dependencies.mjs 2>/dev/null || true)"
    if [[ -z "$node_report" ]] || ! node -e 'process.exit(JSON.parse(process.argv[1]).ready ? 0 : 1)' "$node_report"; then
        printf 'JavaScript dependencies are still incomplete after npm ci. Run ./verify.sh for details.\n' >&2
        exit 1
    fi
else
    printf '[OK] JavaScript dependencies ready; installation skipped.\n'
fi

PYTHON="$ROOT_DIR/backend/api/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
    if [[ -e "$ROOT_DIR/backend/api/.venv" ]]; then
        printf 'The existing .venv is broken or belongs to another OS. Use a clean Linux checkout or move that environment aside; do not reuse a Windows virtual environment.\n' >&2
        exit 1
    fi
    printf '[INSTALL] Creating the Python virtual environment...\n'
    python3 -m venv "$ROOT_DIR/backend/api/.venv"
fi
python_report="$("$PYTHON" -B scripts/check_python_dependencies.py 2>/dev/null || true)"
if [[ -z "$python_report" ]]; then
    printf 'Could not inspect Python dependencies. Run ./verify.sh for details.\n' >&2
    exit 1
fi
if ! "$PYTHON" -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1])["ready"] else 1)' "$python_report"; then
    mapfile -t repairs < <("$PYTHON" -c 'import json,sys; print("\n".join(json.loads(sys.argv[1]).get("repair", [])), end="")' "$python_report")
    if ((${#repairs[@]})); then
        printf '[INSTALL] Repairing damaged Python packages...\n'
        "$PYTHON" -m pip install --force-reinstall --no-deps "${repairs[@]}"
    fi
    printf '[INSTALL] Installing API and development Python dependencies...\n'
    "$PYTHON" -m pip install -r requirements.txt
    python_report="$("$PYTHON" -B scripts/check_python_dependencies.py 2>/dev/null || true)"
    if [[ -z "$python_report" ]] || ! "$PYTHON" -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1])["ready"] else 1)' "$python_report"; then
        printf 'Python dependencies are still incomplete. Run ./verify.sh for details.\n' >&2
        exit 1
    fi
else
    printf '[OK] Python dependencies ready; installation skipped.\n'
fi

if [[ "${1:-}" == "--install-only" ]]; then
    printf 'Project dependencies are ready. No database checks or services were started.\n'
    exit 0
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    printf 'Created .env from .env.example. Fill the five required Supabase/database values, then run ./start.sh again.\n' >&2
    exit 1
fi

npm run check:setup
"$PYTHON" -m app.check_setup
printf 'Applying pending database migrations. Coordinate first if this development database is shared.\n'
"$PYTHON" -m alembic -c backend/api/alembic.ini upgrade head

launcher_start="$(linux_process_start "$$")"
# Boot identity also protects against a PID/start-time match after a reboot.
(umask 077; printf '%s\n%s\n%s\n%s\n' "$$" "$launcher_start" "$ROOT_DIR" "$(cat /proc/sys/kernel/random/boot_id)" > "$STATE_FILE.$$")
mv -f -- "$STATE_FILE.$$" "$STATE_FILE"
SESSION_STARTED=1

cleanup() {
    status=$?
    trap - EXIT INT TERM
    linux_terminate_child "$DASHBOARD_PID" "$DASHBOARD_STARTED"
    linux_terminate_child "$API_PID" "$API_STARTED"
    for pid in "$DASHBOARD_PID" "$API_PID"; do
        if [[ -n "$pid" ]]; then
            wait "$pid" 2>/dev/null || true
        fi
    done
    if ((SESSION_STARTED)); then
        rm -f -- "$STATE_FILE"
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 0' TERM

printf 'Starting the native Python API...\n'
PYTHONUNBUFFERED=1 "$PYTHON" -m uvicorn app.main:app --app-dir backend/api --host 127.0.0.1 --port 8000 \
    >"$TOOLS_DIR/dev-api.stdout.log" 2>"$TOOLS_DIR/dev-api.stderr.log" 9>&- &
API_PID=$!
API_STARTED="$(linux_process_start "$API_PID")"

api_ready=0
for _ in {1..60}; do
    if ! kill -0 "$API_PID" 2>/dev/null; then
        printf 'API exited before becoming healthy. Read .tools/dev-api.stderr.log.\n' >&2
        exit 1
    fi
    if python3 -c 'import json,urllib.request; h=json.load(urllib.request.urlopen("http://127.0.0.1:8000/api/v1/health",timeout=1)); raise SystemExit(0 if h.get("status") == "ok" and h.get("service") == "sproutsync-api" else 1)' 2>/dev/null; then
        api_ready=1
        break
    fi
    sleep 0.25
done
if ((api_ready == 0)); then
    printf 'API did not become healthy. Read .tools/dev-api.stderr.log.\n' >&2
    exit 1
fi

printf 'Starting the dashboard...\n'
(
    cd "$ROOT_DIR/frontend/dashboard"
    exec node "$ROOT_DIR/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 5173 --strictPort
) >"$TOOLS_DIR/dev-dashboard.stdout.log" 2>"$TOOLS_DIR/dev-dashboard.stderr.log" 9>&- &
DASHBOARD_PID=$!
DASHBOARD_STARTED="$(linux_process_start "$DASHBOARD_PID")"

dashboard_ready=0
for _ in {1..60}; do
    if ! kill -0 "$DASHBOARD_PID" 2>/dev/null; then
        printf 'Dashboard exited before becoming ready. Read .tools/dev-dashboard.stderr.log.\n' >&2
        exit 1
    fi
    if python3 -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:5173",timeout=1)' 2>/dev/null; then
        dashboard_ready=1
        break
    fi
    sleep 0.25
done
if ((dashboard_ready == 0)); then
    printf 'Dashboard did not become ready. Read .tools/dev-dashboard.stderr.log.\n' >&2
    exit 1
fi

printf 'SproutSync is running at http://localhost:5173 (API: http://localhost:8000/docs).\n'
printf 'Press Ctrl+C here or run ./stop.sh in another terminal to stop both services.\n'
if wait -n "$API_PID" "$DASHBOARD_PID"; then
    printf 'A SproutSync service exited. Check .tools/dev-api.stderr.log and .tools/dev-dashboard.stderr.log.\n'
else
    status=$?
    printf 'A SproutSync service exited with status %s. Check .tools/dev-api.stderr.log and .tools/dev-dashboard.stderr.log.\n' "$status" >&2
fi
exit 1
