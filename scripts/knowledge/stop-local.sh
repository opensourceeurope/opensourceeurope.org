#!/usr/bin/env bash
# Stop a local stack started by scripts/knowledge/run-local.sh from this checkout:
# the MCP server, the chat function and the astro dev site, plus run-local itself.
#
# run-local.sh records what it starts in a pid file under /tmp/ose-local-$USER/<id>
# (see scripts/knowledge/local-stack.sh), with each process's start time. This
# script stops those processes and their children, and only while the start time
# still matches, so a reused PID is never touched. It never stops a process only
# because it listens on one of the stack's ports, and it trusts the pid file only
# in a state directory that is a real directory, owned by you, with mode 700.
#
# Without a usable pid file (deleted, or the state directory failed the check), it
# falls back to the wrapper processes run-local starts each component under. Their
# command line carries the marker "ose-local-<id>-<name>", where <id> is unique to
# this checkout. A hand-started `opencrane serve`, `npm run dev` or a stack from
# another checkout never carries that marker, so the fallback leaves them alone.
#
# It sends SIGTERM, then SIGKILL to whatever is still alive. Useful when run-local
# was detached and Ctrl-C isn't an option.
#
# Usage: ./scripts/knowledge/stop-local.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
# shellcheck source=scripts/knowledge/local-stack.sh
. scripts/knowledge/local-stack.sh
stack_init

roots=""
trusted=0
unknown=0
if [ -e "$STATE_DIR" ] || [ -L "$STATE_DIR" ]; then
  if stack_dirs_trusted; then
    trusted=1
  else
    echo "WARNING: not reading the pid file in $STATE_DIR; trying the fallback only." >&2
  fi
fi

if [ "$trusted" = 1 ] && [ -s "$PID_FILE" ]; then
  while read -r _name pid start; do
    case "$pid" in ''|*[!0-9]*) continue ;; esac
    if pid_matches "$pid" "$start"; then
      roots="$roots $pid"
    elif kill -0 "$pid" 2>/dev/null && [ -z "$(pid_start "$pid")" ]; then
      unknown=1 # alive, but its start time cannot be read: leave it and keep the file
    fi
  done < "$PID_FILE"
fi

if [ -z "$roots" ]; then
  for pid in $(pgrep -f "ose-local-$STACK_ID-(mcp|function|site) " 2>/dev/null); do
    roots="$roots $pid"
    # Also stop the run-local.sh that started this wrapper, if it is still there.
    parent="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
    if [ -n "$parent" ] && ps -o command= -p "$parent" 2>/dev/null | grep -q 'scripts/knowledge/run-local\.sh'; then
      roots="$roots $parent"
    fi
  done
  [ -n "$roots" ] && echo "==> No usable pid file; matched this checkout's run-local processes by their marker."
fi

pids=""
for r in $roots; do pids="$pids $(descendants "$r") $r"; done
# Dedupe, and remember each start time so the SIGKILL round hits the same processes.
targets="$(for p in $pids; do s="$(pid_start "$p")"; [ -n "$s" ] && echo "$p $s"; done | awk '!seen[$1]++')"

forget_pid_file() {
  if [ "$trusted" = 1 ] && [ "$unknown" = 0 ]; then rm -f "$PID_FILE"; fi
}

if [ -z "$targets" ]; then
  echo "Nothing from run-local.sh is running for this checkout."
  forget_pid_file
  exit 0
fi

living() { echo "$targets" | while read -r p s; do pid_matches "$p" "$s" && echo "$p"; done; }
oneline() { tr '\n' ' ' | sed 's/ *$//'; }

list="$(echo "$targets" | awk '{print $1}')"
echo "==> Stopping (SIGTERM): $(echo "$list" | oneline)"
# shellcheck disable=SC2086 # word splitting of the pid list is intended
kill $list 2>/dev/null || true
for _ in 1 2 3 4 5; do [ -z "$(living)" ] && break; sleep 1; done

left="$(living)"
if [ -n "$left" ]; then
  echo "==> Still alive, forcing (SIGKILL): $(echo "$left" | oneline)"
  # shellcheck disable=SC2086
  kill -9 $left 2>/dev/null || true
  sleep 1
fi

left="$(living)"
if [ -z "$left" ]; then
  forget_pid_file
  echo "Stopped the local stack."
else
  echo "WARNING: still running: $(echo "$left" | oneline)" >&2
  exit 1
fi
