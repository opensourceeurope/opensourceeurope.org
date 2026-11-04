#!/usr/bin/env bash
# Run the full OSE chat stack locally with one command:
#   - OpenCrane MCP server        :8000  (Milvus Lite, auto-indexes)
#   - chat function (agent loop)  :8080
#   - the site (npm run dev)      :4321   (left out with --no-ui)
#
# Offline by default: the function talks to a local Ollama instead of Mistral
# La Plateforme. Values in functions/chat/.env (if present) take precedence.
#
# Ports default to 8000/8080/4321 but are picked dynamically: if a preferred
# port is busy, the next free one is used (override preference via
# MCP_PORT / FUNC_PORT / SITE_PORT).
#
# Usage: ./scripts/knowledge/run-local.sh                                # offline via Ollama
#        OLLAMA_MODEL=llama3.1:8b ./scripts/knowledge/run-local.sh       # different local model
#        ./scripts/knowledge/run-local.sh --hosted                       # real Mistral API
#                                                              # (needs MISTRAL_API_KEY)
#        ./scripts/knowledge/run-local.sh --fresh                         # re-embed from scratch
#                                                              # (drop the cached index first)
#        ./scripts/knowledge/run-local.sh --no-ui                         # only the MCP server and the function
#                                                              # (npm run dev:chat; then run npm run dev
#                                                              # with PUBLIC_CHAT_ENDPOINT=http://localhost:<function port>)
#
# Logs and the pid file go to /tmp/ose-local-$USER/<checkout id>/logs. Stop a detached run with
# ./scripts/knowledge/stop-local.sh, which stops only the processes recorded there.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-mistral-small3.2}"
MODE="offline"
FRESH=0
NO_UI=0
for arg in "$@"; do
  case "$arg" in
    --hosted) MODE="--hosted" ;;
    --fresh)  FRESH=1 ;;
    --no-ui)  NO_UI=1 ;;
    *) echo "ERROR: unknown argument '$arg' (expected --hosted, --fresh and/or --no-ui)." >&2; exit 1 ;;
  esac
done
# Logs, the pid file and Milvus Lite's socket live in a short, private, per-checkout
# directory, /tmp/ose-local-$USER/<id> (see scripts/knowledge/local-stack.sh).
# Milvus Lite puts its Unix socket in $TMPDIR, and a socket path longer than
# 103 characters fails, which a long $TMPDIR (macOS, sandboxes) easily exceeds.
# shellcheck source=scripts/knowledge/local-stack.sh
. scripts/knowledge/local-stack.sh
stack_init
stack_dirs_create || exit 1
# Every child gets the short TMPDIR: Milvus Lite (MCP) and tsx (the function) both
# create Unix sockets there.
export TMPDIR="$SOCK_TMP"

# Refuse to start a second stack from this checkout. Checked before anything else
# (also before --fresh deletes the index a running stack is serving).
if [ -s "$PID_FILE" ]; then
  while read -r _name pid start; do
    if [ -n "${pid:-}" ] && pid_matches "$pid" "${start:-}"; then
      echo "ERROR: a local stack from an earlier run is still running (see $PID_FILE)." >&2
      echo "  Stop it first: ./scripts/knowledge/stop-local.sh" >&2
      exit 1
    fi
  done < "$PID_FILE"
fi
# Every process this script starts is recorded in $PID_FILE with its start time,
# this script itself first, so stop-local.sh stops exactly these process trees.
: > "$PID_FILE"
record_pid run-local $$

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "==> Stopping..."
  # Only the processes this script started (and their children), never the whole
  # process group, which can include the shell or tool that launched this script.
  local name pid start pids=""
  if [ -f "$PID_FILE" ]; then
    while read -r name pid start; do
      [ "$name" = run-local ] && continue
      pid_matches "$pid" "$start" || continue
      pids="$pids $(descendants "$pid") $pid"
    done < "$PID_FILE"
  fi
  # shellcheck disable=SC2086 # word splitting of the pid list is intended
  [ -z "${pids// /}" ] || kill $pids 2>/dev/null || true
  rm -f "$PID_FILE"
}
trap cleanup INT TERM EXIT

launch() { # name dir log command... — start a component in the background and record it
  # The bash wrapper stays the component's parent, and its command line carries the
  # marker "ose-local-<checkout id>-<name>", which stop-local.sh's fallback matches.
  local name="$1" dir="$2" log="$3"
  shift 3
  # shellcheck disable=SC2016 # $1 and $@ belong to the wrapper
  bash -c 'cd "$1" || exit 1; shift; "$@"; exit $?' "ose-local-$STACK_ID-$name" "$dir" "$@" >"$log" 2>&1 &
  record_pid "$name" $!
}

need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "ERROR: '$1' not found. Install it:" >&2
  case "$1" in
    uvx)     echo "  uv:     brew install uv      |  curl -LsSf https://astral.sh/uv/install.sh | sh" >&2 ;;
    ollama)  echo "  Ollama: brew install ollama  |  https://ollama.com/download" >&2 ;;
    npm)     echo "  Node:   brew install node    |  https://nodejs.org" >&2 ;;
    python3) echo "  Python: brew install python  |  https://www.python.org/downloads/" >&2 ;;
    curl)    echo "  curl:   brew install curl    |  (usually preinstalled)" >&2 ;;
    *)       echo "  (see the tool's documentation for install instructions)" >&2 ;;
  esac
  exit 1
}
need uvx; need npm; need python3; need curl
OPENCRANE_VERSION="$(tr -d '[:space:]' < .opencrane/opencrane-version)"
# .opencrane/constraints.txt caps the dependencies opencrane leaves unpinned (transformers).
OC="${OPENCRANE:-uvx --constraints .opencrane/constraints.txt opencrane@${OPENCRANE_VERSION}}"

port_free() { # $1 = port — busy if anything accepts on 127.0.0.1 OR ::1
  # "localhost" resolves to both, and a server such as astro dev may hold only the
  # IPv6 one, so an IPv4-only check reports a busy port as free.
  python3 - "$1" <<'PY'
import socket, sys
port = int(sys.argv[1])
busy = False
for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
    try:
        s = socket.socket(family)
    except OSError:  # no IPv6 on this host
        continue
    s.settimeout(0.3)
    try:
        busy = busy or s.connect_ex((host, port)) == 0
    except OSError:
        pass
    finally:
        s.close()
sys.exit(1 if busy else 0)
PY
}
pick_port() { # $1 = preferred port — echoes the first free port from there up
  local p="$1"
  until port_free "$p"; do p=$((p + 1)); done
  if [ "$p" != "$1" ]; then echo "    (port $1 busy -> using $p)" >&2; fi
  echo "$p"
}
MCP_PORT="$(pick_port "${MCP_PORT:-8000}")"
FUNC_PORT="$(pick_port "${FUNC_PORT:-8080}")"
SITE_PORT="$(pick_port "${SITE_PORT:-4321}")"

# --- function env: functions/chat/.env wins, then mode defaults -------------------
if [ -f functions/chat/.env ]; then
  set -a; . functions/chat/.env; set +a
fi
export OSE_MCP_URL="http://localhost:$MCP_PORT/mcp"   # always the local MCP

if [ "$MODE" = "--hosted" ]; then
  [ -n "${MISTRAL_API_KEY:-}" ] || { echo "ERROR: --hosted needs MISTRAL_API_KEY (env or functions/chat/.env)." >&2; exit 1; }
else
  export MISTRAL_BASE_URL="${MISTRAL_BASE_URL:-$OLLAMA_URL}"
  export MISTRAL_MODEL="${MISTRAL_MODEL:-$OLLAMA_MODEL}"
  export MISTRAL_API_KEY="${MISTRAL_API_KEY:-ollama}"
  need ollama
  curl -s -o /dev/null --max-time 2 "$MISTRAL_BASE_URL" \
    || { echo "ERROR: no Ollama at $MISTRAL_BASE_URL — run 'ollama serve' (or open the app)." >&2; exit 1; }
  ollama list | awk '{print $1}' | grep -q "^${MISTRAL_MODEL}" \
    || { echo "ERROR: model '$MISTRAL_MODEL' not pulled — run 'ollama pull $MISTRAL_MODEL' (or wait for the pull to finish)." >&2; exit 1; }
fi

# --- index inputs (the committed index is used; it is regenerated only if both files are missing) -----
# --fresh drops the cached index so changed build inputs (chunks.json/llmstxt/)
# get re-embedded; the presence check below then triggers a rebuild.
if [ "$FRESH" = 1 ]; then
  echo "==> --fresh: removing cached index (.opencrane/milvus.db, .opencrane/embeddings.json)"
  rm -f .opencrane/milvus.db .opencrane/embeddings.json
fi
if [ ! -f .opencrane/milvus.db ] && [ ! -f .opencrane/embeddings.json ]; then
  echo "==> No local index found; generating embeddings (one-time, takes a while)..."
  $OC embed
fi

wait_http() { # url name timeout_s — any HTTP response counts as up
  local i
  for i in $(seq 1 "$3"); do
    curl -s -o /dev/null --max-time 2 "$1" && return 0
    sleep 1
  done
  echo "ERROR: $2 did not come up within $3 s — see $LOG_DIR" >&2
  return 1
}

# The embedding model runs locally, but sentence-transformers revalidates its
# HuggingFace cache over the network on every startup (~40 HEAD requests, several
# seconds). Once the model is cached, go offline so it loads straight from disk.
# Skipped on a cold cache so the first run can still download the model.
HF_CACHE="${HF_HOME:-$HOME/.cache/huggingface}/hub"
if [ -d "$HF_CACHE/models--nomic-ai--nomic-embed-text-v1.5" ]; then
  export HF_HUB_OFFLINE=1
fi

echo "==> Starting MCP server on :$MCP_PORT (log: $LOG_DIR/mcp.log)"
# LOG_LEVEL=WARNING matches the hosted container (.opencrane/Dockerfile): no search queries in the log.
# shellcheck disable=SC2086 # $OC is a command line, split on purpose
launch mcp . "$LOG_DIR/mcp.log" env LOG_LEVEL=WARNING MILVUS_DB_PATH=.opencrane/milvus.db MCP_HTTP_PORT="$MCP_PORT" $OC serve --transport http
wait_http "http://localhost:$MCP_PORT/mcp" "MCP server" 120

echo "==> Starting chat function on :$FUNC_PORT (log: $LOG_DIR/function.log)"
[ -d functions/chat/node_modules ] || (cd functions/chat && npm install)
launch function functions/chat "$LOG_DIR/function.log" env PORT="$FUNC_PORT" npm run dev
wait_http "http://localhost:$FUNC_PORT" "chat function" 60

if [ "$NO_UI" = 0 ]; then
  echo "==> Starting the site on :$SITE_PORT (log: $LOG_DIR/site.log)"
  [ -d node_modules ] || npm ci
  [ -f .env ] || cp .env.example .env
  # --ignore-lock keeps astro dev in the foreground as this script's child. Without
  # it, Astro 7 detaches into a background server when it detects a coding agent,
  # and then neither Ctrl-C nor stop-local.sh can find it through the pid file.
  # NO_COLOR/FORCE_COLOR keep ANSI colours out of the log, so the URL below parses.
  launch site . "$LOG_DIR/site.log" env PUBLIC_CHAT_ENDPOINT="http://localhost:$FUNC_PORT" NO_COLOR=1 FORCE_COLOR=0 \
    npm run dev -- --port "$SITE_PORT" --ignore-lock
  # Astro moves to another port if the requested one turns out to be taken, so use
  # the URL it reports it serves ("Local    http://localhost:NNNN/").
  SITE_URL=""
  for _ in $(seq 1 60); do
    # Strip ANSI escapes too, in case a tool colours the output anyway.
    SITE_URL="$(sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$LOG_DIR/site.log" 2>/dev/null \
      | grep -Eo 'Local +http://[^/[:space:]"\\]+/' | head -1 | sed -E 's/^Local +//' || true)"
    [ -n "$SITE_URL" ] && break
    sleep 1
  done
  [ -n "$SITE_URL" ] || { echo "ERROR: the site did not report its URL within 60 s — see $LOG_DIR/site.log" >&2; exit 1; }
  if [ "$SITE_URL" != "http://localhost:$SITE_PORT/" ]; then
    echo "    (astro moved the site from port $SITE_PORT to $SITE_URL)" >&2
  fi
  wait_http "$SITE_URL" "site" 60
fi

echo ""
if [ "$MODE" = "--hosted" ]; then
  echo "Ready (hosted Mistral, model: ${MISTRAL_MODEL:-mistral-small-latest})."
else
  echo "Ready (offline: Ollama $MISTRAL_MODEL at $MISTRAL_BASE_URL)."
fi
[ "$NO_UI" = 0 ] && echo "  Site:      ${SITE_URL}ask/"
echo "  Function:  http://localhost:$FUNC_PORT"
echo "  MCP:       http://localhost:$MCP_PORT/mcp"
echo ""
[ "$NO_UI" = 1 ] && echo "No UI started. Run: PUBLIC_CHAT_ENDPOINT=http://localhost:$FUNC_PORT npm run dev"
echo "Ctrl-C stops everything."
if [ "$NO_UI" = 0 ] && command -v open >/dev/null 2>&1; then open "${SITE_URL}ask/"; fi
wait
