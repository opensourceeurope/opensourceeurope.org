#!/usr/bin/env bash
# Make the committed vector index consistent with the committed chunks, regenerating
# ONLY what actually changed. embeddings.json + milvus.db are committed build artifacts
# (see AGENTS.md); this script is the single place that decides whether they need
# rebuilding. Used by refresh.yml (after re-chunking) and release.yml (as a safety net
# before packing), and runnable locally after you touch chunks/config.
#
#   ./scripts/knowledge/ensure-index.sh          regenerate embeddings/index as needed, then stop
#   ./scripts/knowledge/ensure-index.sh --check  CI mode: exit 1 if the committed index is stale
#                                      vs the committed chunks (never regenerates)
#
# Why not just `opencrane embed`? Since 0.33 opencrane skips an unchanged chunks file
# itself, but this script also serves CI's --check mode, which must never load the
# model. It compares the chunks hash with the one embeddings.json stores and only
# invokes `embed --force` when the chunks genuinely changed.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# opencrane is version-locked in .opencrane/opencrane-version (single source of truth,
# bumped by hand — never floats to the latest PyPI release). We invoke it through uvx at
# that exact version, so local runs and CI use the same opencrane. Override with the
# OPENCRANE env var (e.g. OPENCRANE="uvx --constraints .opencrane/constraints.txt opencrane@0.21.0" ./scripts/knowledge/ensure-index.sh) to
# trial a new version before committing the bump. Word-splitting of $OC is intentional.
# .opencrane/constraints.txt caps the dependencies opencrane leaves unpinned (transformers);
# keep the --constraints flag in any override.
OPENCRANE_VERSION="$(tr -d '[:space:]' < .opencrane/opencrane-version)"
OC="${OPENCRANE:-uvx --constraints .opencrane/constraints.txt opencrane@${OPENCRANE_VERSION}}"

CHUNKS=".opencrane/chunks.json"
EMBEDDINGS=".opencrane/embeddings.json"
MILVUS=".opencrane/milvus.db"

if [ ! -f "$CHUNKS" ]; then
  echo "ERROR: $CHUNKS not found — run 'opencrane chunk' first." >&2
  exit 1
fi

# Canonical chunks hash, computed EXACTLY the way opencrane (>= 0.33) stores it in
# embeddings.json: json.dumps(chunks, indent=2, sort_keys=True, ensure_ascii=False),
# which is also how it writes chunks.json — so the two are comparable.
current_sha="$(python3 -c "import json,hashlib;print(hashlib.sha256(json.dumps(json.load(open('$CHUNKS',encoding='utf-8')),indent=2,sort_keys=True,ensure_ascii=False).encode('utf-8')).hexdigest())")"

# The hash the committed embeddings were built from ("" if the file is absent).
stored_sha=""
if [ -f "$EMBEDDINGS" ]; then
  stored_sha="$(python3 -c "import json;print(json.load(open('$EMBEDDINGS')).get('chunks_sha256',''))" 2>/dev/null || echo "")"
fi

need_embed=false
[ -f "$EMBEDDINGS" ] || need_embed=true
[ "$current_sha" = "$stored_sha" ] || need_embed=true

need_index=false
[ -f "$MILVUS" ] || need_index=true
$need_embed && need_index=true

if [ "${1:-}" = "--check" ]; then
  if $need_embed; then
    echo "ERROR: committed embeddings are stale vs chunks.json." >&2
    echo "  chunks (canonical) sha256: $current_sha" >&2
    echo "  embeddings.json chunks_sha256: ${stored_sha:-<missing>}" >&2
    echo "  Run ./scripts/knowledge/ensure-index.sh and commit .opencrane/embeddings.json + .opencrane/milvus.db." >&2
    exit 1
  fi
  if $need_index; then
    echo "ERROR: $MILVUS is missing — run ./scripts/knowledge/ensure-index.sh and commit it." >&2
    exit 1
  fi
  echo "OK: committed index is in sync with chunks.json."
  exit 0
fi

if ! $need_embed && ! $need_index; then
  echo "Index already current (chunks unchanged) — reusing committed embeddings.json + milvus.db."
  exit 0
fi

# Milvus Lite creates its Unix socket in $TMPDIR, and a socket path longer than 103
# characters fails, which a long $TMPDIR (macOS, sandboxes) easily exceeds. Give
# embed and index a short private one, removed on exit.
SOCK_TMP="$(mktemp -d /tmp/ose.XXXXXX)"
trap 'rm -rf "$SOCK_TMP"' EXIT

if $need_embed; then
  echo "Chunks changed (or embeddings missing) — regenerating embeddings..."
  # The embed step downloads the model from HuggingFace, which can hit anonymous 429s
  # on shared CI runners — retry a few times. (An HF_TOKEN removes this flakiness.)
  embedded=false
  for i in 1 2 3 4 5; do
    if TMPDIR="$SOCK_TMP" $OC embed --force; then embedded=true; break; fi
    echo "embed failed (HuggingFace rate-limit?), retry $i/5 after 25s..."; sleep 25
  done
  $embedded || { echo "ERROR: embed failed after 5 attempts — not indexing stale embeddings." >&2; exit 1; }
else
  echo "Embeddings current — skipping embed; rebuilding index only."
fi

echo "Building vector index (milvus.db)..."
# DROP_EXISTING=true forces a fresh rebuild. Without it, `opencrane index` sees the
# committed milvus.db's already-populated collection and SKIPS the rebuild, leaving a
# stale index that then gets packed into the release (opencrane pack copies milvus.db
# verbatim). We only reach here when the index actually needs rebuilding, so always
# drop and repopulate from the freshly-embedded vectors.
TMPDIR="$SOCK_TMP" DROP_EXISTING=true $OC index

echo "Done: index is consistent with chunks.json."
