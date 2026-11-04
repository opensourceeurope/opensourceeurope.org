# shellcheck shell=bash
# Shared by run-local.sh and stop-local.sh (sourced, not run). It holds the state
# directory, the pid file format and the checks both scripts apply before they act
# on a recorded PID.
#
# State lives in /tmp/ose-local-$USER/<id>, where <id> is the first 8 hex digits of
# the SHA-256 of this checkout's root path, so two checkouts never share a pid file.
# The path stays short on purpose: Milvus Lite creates its Unix socket in $TMPDIR,
# and a socket path longer than 103 characters fails.
#
# The pid file has one line per process: "<name> <pid> <start time>", where the
# start time is `ps -o lstart=`. A PID counts as ours only while its start time
# still matches, so a PID the system reused for another process is never touched.

stack_init() { # sets ROOT, STACK_ID, STATE_BASE, STATE_DIR, LOG_DIR, SOCK_TMP, PID_FILE
  ROOT="$(cd "$(git rev-parse --show-toplevel)" && pwd -P)"
  local sum
  if command -v shasum >/dev/null 2>&1; then sum="shasum -a 256"; else sum="sha256sum"; fi
  STACK_ID="$(printf '%s' "$ROOT" | $sum | cut -c1-8)"
  STATE_BASE="/tmp/ose-local-$(id -un)"
  STATE_DIR="$STATE_BASE/$STACK_ID"
  LOG_DIR="$STATE_DIR/logs"
  SOCK_TMP="$STATE_DIR/tmp"
  PID_FILE="$LOG_DIR/pids"
}

private_dir_ok() { # $1 = dir — a real directory (no symlink), ours, mode 700
  local d="$1" owner mode
  if [ -L "$d" ] || [ ! -d "$d" ]; then
    echo "ERROR: $d is not a real directory (missing, or a symlink)." >&2
    return 1
  fi
  # GNU stat first: on Linux `stat -f` is a different (file system) query.
  if ! read -r owner mode < <(stat -c '%u %a' "$d" 2>/dev/null || stat -f '%u %Lp' "$d" 2>/dev/null) \
      || [ -z "$owner" ]; then
    echo "ERROR: cannot read the owner and mode of $d." >&2
    return 1
  fi
  if [ "$owner" != "$(id -u)" ] || [ "$mode" != 700 ]; then
    echo "ERROR: $d must be owned by $(id -un) with mode 700 (it has uid $owner, mode $mode)." >&2
    echo "  Remove it if it is left from an older run: rm -rf '$d'" >&2
    return 1
  fi
}

stack_dirs_create() { # create the state dirs safely, then check them before use
  local old_umask rc=0
  old_umask="$(umask)"
  umask 077
  _stack_dirs_create || rc=1
  umask "$old_umask"
  return "$rc"
}
_stack_dirs_create() {
  # Each mkdir creates at most its last component (the parents exist or were made
  # by the line before), so -m 700 covers every directory it creates.
  # shellcheck disable=SC2174
  mkdir -p -m 700 "$STATE_BASE" && mkdir -p -m 700 "$STATE_DIR" || return 1
  private_dir_ok "$STATE_BASE" && private_dir_ok "$STATE_DIR" || return 1
  # shellcheck disable=SC2174
  mkdir -p -m 700 "$LOG_DIR" "$SOCK_TMP"
}

stack_dirs_trusted() { # true if the state dirs exist and pass the checks
  [ -e "$STATE_DIR" ] || [ -L "$STATE_DIR" ] || return 1
  private_dir_ok "$STATE_BASE" && private_dir_ok "$STATE_DIR" && private_dir_ok "$LOG_DIR"
}

pid_start() { # $1 = pid — its start time, whitespace-normalised, or nothing if gone
  ps -o lstart= -p "$1" 2>/dev/null | awk '{$1=$1; print}'
}

pid_matches() { # $1 = pid, $2 = recorded start time — true if the same process still runs
  local now
  now="$(pid_start "$1")"
  [ -n "$now" ] && [ "$now" = "$2" ]
}

record_pid() { # $1 = name, $2 = pid
  printf '%s %s %s\n' "$1" "$2" "$(pid_start "$2")" >> "$PID_FILE"
}

descendants() { # $1 = pid — prints every descendant pid, deepest first
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done
}
