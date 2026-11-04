#!/usr/bin/env bash
# PostToolUse hook for Write and Edit. After an edit to the ose-researcher persona
# or its generated plugin copy, runs scripts/knowledge/sync-agent.sh in the checkout
# that holds the edited file. That checkout can differ from the session's working directory.
set -u
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$f" in
  */agent/ose-researcher.md)
    msg="sync-agent: plugin copy regenerated from agent/ose-researcher.md" ;;
  */plugins/ose-knowledge/agents/ose-researcher.md)
    msg="sync-agent: the plugin copy is GENERATED, direct edits are overwritten from agent/ose-researcher.md" ;;
  *) exit 0 ;;
esac
root=$(git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -x "$root/scripts/knowledge/sync-agent.sh" ] || exit 0
(cd "$root" && ./scripts/knowledge/sync-agent.sh >/dev/null) || exit 0
jq -n --arg m "$msg" '{systemMessage: $m}'
