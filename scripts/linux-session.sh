# Shared Linux process identity checks. Never source .env or execute a PID file.
linux_process_start() {
    local pid="$1" stat rest
    [[ "$pid" =~ ^[1-9][0-9]*$ && -r "/proc/$pid/stat" ]] || return 1
    stat="$(cat "/proc/$pid/stat" 2>/dev/null)" || return 1
    read -r -a rest <<< "${stat##*) }"
    [[ "${rest[0]:-Z}" != Z && "${rest[0]:-X}" != X && "${rest[19]:-}" =~ ^[0-9]+$ ]] || return 1
    printf '%s\n' "${rest[19]}"
}

linux_process_matches() {
    local actual
    [[ -n "${1:-}" && -n "${2:-}" ]] || return 1
    actual="$(linux_process_start "$1")" || return 1
    [[ "$actual" == "$2" ]]
}

linux_read_session() {
    [[ -f "$STATE_FILE" ]] || return 1
    mapfile -t state < "$STATE_FILE"
    if ((${#state[@]} != 4)) || [[ "${state[2]}" != "$ROOT_DIR" ]] ||
        [[ ! "${state[0]}" =~ ^[1-9][0-9]*$ || ! "${state[1]}" =~ ^[0-9]+$ || -z "${state[3]}" ]]; then
        printf 'Session record is invalid, from an older launcher, or belongs to another checkout. No processes were stopped. Inspect %s; stop older launchers with Ctrl+C.\n' "$STATE_FILE" >&2
        return 2
    fi
}

linux_launcher_matches() {
    local cwd args
    [[ "${state[3]}" == "$(cat /proc/sys/kernel/random/boot_id)" ]] || return 1
    linux_process_matches "${state[0]}" "${state[1]}" || return 1
    cwd="$(readlink "/proc/${state[0]}/cwd" 2>/dev/null)" || return 1
    args="$(tr '\0' ' ' < "/proc/${state[0]}/cmdline" 2>/dev/null)" || return 1
    [[ "$cwd" == "$ROOT_DIR" && "$args" == *start.sh* ]]
}

linux_terminate_child() {
    local pid="${1:-}" started="${2:-}" attempt
    linux_process_matches "$pid" "$started" || return 0
    kill -TERM "$pid" 2>/dev/null || true
    for ((attempt = 0; attempt < 50; attempt++)); do
        linux_process_matches "$pid" "$started" || return 0
        sleep 0.1
    done
    if linux_process_matches "$pid" "$started"; then
        kill -KILL "$pid" 2>/dev/null || true
    fi
}
