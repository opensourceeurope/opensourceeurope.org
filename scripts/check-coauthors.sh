#!/usr/bin/env bash
# Usage: check-coauthors.sh <base> <head>
# Exits 1 when any commit in <base>..<head> has an agent Co-authored-by trailer.
set -u
[ $# -eq 2 ] || { echo "usage: $0 <base> <head>" >&2; exit 2; }
root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=agent-trailer.sh
. "$root/scripts/agent-trailer.sh"

tmp=$(mktemp) || exit 2
trap 'rm -f "$tmp"' EXIT
bad=0
for sha in $(git rev-list "$1..$2"); do
  git log -1 --format=%B "$sha" > "$tmp"
  if is_agent_trailer "$tmp"; then
    echo "Agent Co-authored-by trailer in commit $sha: $(git log -1 --format=%s "$sha")" >&2
    bad=1
  fi
done
exit "$bad"
