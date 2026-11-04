#!/usr/bin/env bash
# PreToolUse hook on Bash. Denies a `git commit` command whose text carries an
# agent Co-authored-by trailer (OSE AI policy), using the same rule as the
# commit-msg hook.
set -u
root=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck source=../../scripts/agent-trailer.sh
. "$root/scripts/agent-trailer.sh"

command_str=$(jq -r '.tool_input.command // ""' 2>/dev/null)
printf '%s' "$command_str" | grep -qE 'git([[:space:]]+-[A-Za-z]+[[:space:]]+[^[:space:]]+)*[[:space:]]+commit' || exit 0

tmp=$(mktemp) || exit 0
trap 'rm -f "$tmp"' EXIT
printf '%s\n' "$command_str" > "$tmp"

if is_agent_trailer "$tmp"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "OSE AI policy: agents are never co-authors. Remove the Co-authored-by trailer that names an agent from this commit message. Disclose AI use with a Generated-by: line in the pull request."
    }
  }'
fi
exit 0
