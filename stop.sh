#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$ROOT_DIR/.tools/dev-session.pid"
if [[ "$(uname -s)" != Linux ]]; then
    printf 'Use stop.bat on Windows. The .sh launchers require Linux.\n' >&2
    exit 1
fi
if (($#)); then
    printf 'Usage: ./stop.sh\n' >&2
    exit 2
fi
source "$ROOT_DIR/scripts/linux-session.sh"

if [[ ! -f "$STATE_FILE" ]]; then
    printf 'No managed local session is running.\n'
    exit 0
fi

linux_read_session || exit 1
launcher_pid="${state[0]}"
expected_start="${state[1]}"
if [[ "${state[3]}" != "$(cat /proc/sys/kernel/random/boot_id)" ]] || ! linux_process_start "$launcher_pid" >/dev/null; then
    rm -f -- "$STATE_FILE"
    printf 'Removed a stale launcher record. No processes were signalled.\n'
    exit 0
fi

if ! linux_launcher_matches; then
    printf 'Session PID no longer identifies this checkout launcher. No processes were stopped; inspect %s.\n' "$STATE_FILE" >&2
    exit 1
fi

kill -TERM "$launcher_pid"
for _ in {1..150}; do
    if ! linux_process_matches "$launcher_pid" "$expected_start"; then
        printf 'SproutSync dashboard and API stopped.\n'
        exit 0
    fi
    sleep 0.1
done
printf 'Launcher did not stop in time. Press Ctrl+C in its terminal and inspect the .tools logs.\n' >&2
exit 1
