#!/usr/bin/env bash
# Tests for the agent harness: trailer rule, commit-msg hook, Claude hooks.
# Prints PASS or FAIL per assertion and exits non-zero on any FAIL.
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# Primary checkout, derived from git the way branch-guard.sh does it.
common=$(cd "$ROOT" && git rev-parse --git-common-dir)
PRIMARY=$(cd "$ROOT" && cd "$common/.." && pwd -P)
fails=0

check() { # name, condition result (0 = pass)
  if [ "$2" -eq 0 ]; then echo "PASS $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# commit-msg hook
printf 'feat: x\n\nCo-authored-by: Claude <noreply@anthropic.com>\n' > "$tmp/bad"
printf 'feat: x\n\nCo-authored-by: Jane Doe <jane@agentur.de>\n' > "$tmp/good"
bash "$ROOT/.githooks/commit-msg" "$tmp/bad" >/dev/null 2>&1; rc=$?
check "commit-msg rejects an agent trailer" $([ "$rc" -eq 1 ] && echo 0 || echo 1)
bash "$ROOT/.githooks/commit-msg" "$tmp/good" >/dev/null 2>&1; rc=$?
check "commit-msg accepts a human co-author" $([ "$rc" -eq 0 ] && echo 0 || echo 1)

# no-agent-coauthor.sh
out=$(printf '%s' '{"tool_input":{"command":"git commit -m \"x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>\""}}' | bash "$ROOT/.claude/hooks/no-agent-coauthor.sh" 2>/dev/null)
check "no-agent-coauthor denies an agent trailer" $(printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1 && echo 0 || echo 1)
out=$(printf '%s' '{"tool_input":{"command":"git status"}}' | bash "$ROOT/.claude/hooks/no-agent-coauthor.sh" 2>/dev/null)
check "no-agent-coauthor ignores git status" $([ -z "$out" ] && echo 0 || echo 1)

# check-coauthors.sh in a throwaway repo: base, then clean, then bad
repo="$tmp/repo"
mkdir "$repo"
(
  cd "$repo" || exit 1
  git init -q
  git config user.email t@example.com
  git config user.name t
  git config commit.gpgsign false
  echo a > a && git add a && git commit -q -m "base"
  git rev-parse HEAD > "$tmp/base_sha"
  echo b > b && git add b && git commit -q -m "clean"
  git rev-parse HEAD > "$tmp/clean_sha"
  echo c > c && git add c
  git commit -q --no-verify -m "bad" -m "Co-authored-by: Claude <noreply@anthropic.com>"
  git rev-parse HEAD > "$tmp/bad_sha"
)
base_sha=$(cat "$tmp/base_sha")
clean_sha=$(cat "$tmp/clean_sha")
bad_sha=$(cat "$tmp/bad_sha")
(cd "$repo" && bash "$ROOT/scripts/check-coauthors.sh" "$base_sha" "$bad_sha" >/dev/null 2>&1); rc=$?
check "check-coauthors exits 1 over a range with an agent trailer" $([ "$rc" -eq 1 ] && echo 0 || echo 1)
(cd "$repo" && bash "$ROOT/scripts/check-coauthors.sh" "$base_sha" "$clean_sha" >/dev/null 2>&1); rc=$?
check "check-coauthors exits 0 over a clean, non-empty range" $([ "$rc" -eq 0 ] && echo 0 || echo 1)

# branch-guard.sh: deny in the primary checkout, allow in a real linked worktree
out=$(printf '%s' "{\"tool_input\":{\"file_path\":\"$PRIMARY/README.md\"}}" | bash "$ROOT/.claude/hooks/branch-guard.sh" 2>/dev/null)
check "branch-guard denies edits in the primary checkout" $(printf '%s' "$out" | grep -q deny && echo 0 || echo 1)
wt="$tmp/linked-wt"
if git -C "$ROOT" worktree add -q --detach "$wt" HEAD >/dev/null 2>&1; then
  out=$(printf '%s' "{\"tool_input\":{\"file_path\":\"$wt/README.md\"}}" | bash "$ROOT/.claude/hooks/branch-guard.sh" 2>/dev/null)
  check "branch-guard allows edits in a linked worktree" $([ -z "$out" ] && echo 0 || echo 1)
  git -C "$ROOT" worktree remove --force "$wt" >/dev/null 2>&1
else
  check "branch-guard allows edits in a linked worktree (could not create one)" 1
fi

# settings.json: every hook runs from $CLAUDE_PROJECT_DIR, so a session whose cwd
# has no .claude/ folder cannot make the guard exit 127 and fail open.
bad_hooks=$(jq -r '.hooks[][].hooks[].command' "$ROOT/.claude/settings.json" | grep -cv '^bash "\$CLAUDE_PROJECT_DIR"/\.claude/hooks/[a-z-]*\.sh$')
check "settings.json runs every hook from \$CLAUDE_PROJECT_DIR" $([ "$bad_hooks" -eq 0 ] && echo 0 || echo 1)

# branch-guard.sh, Bash tool: payloads with a cwd and a command.
guard_bash() { # cwd, command, [hook path]
  jq -n --arg d "$1" --arg c "$2" '{cwd: $d, tool_input: {command: $c}}' \
    | CLAUDE_PROJECT_DIR="$ROOT" bash "${3:-$ROOT/.claude/hooks/branch-guard.sh}" 2>/dev/null
}
expect_deny() { # name, cwd, command
  out=$(guard_bash "$2" "$3")
  check "branch-guard denies: $1" $(printf '%s' "$out" | grep -q '"deny"' && echo 0 || echo 1)
}
expect_allow() { # name, cwd, command, [hook path]
  out=$(guard_bash "$2" "$3" "${4:-}")
  check "branch-guard allows: $1" $([ -z "$out" ] && echo 0 || echo 1)
}
nl='
'

# Read-only work in the primary checkout stays allowed.
expect_allow "git status in primary" "$PRIMARY" "git status"
expect_allow "git log in primary" "$PRIMARY" "git log --oneline -5"
expect_allow "git diff in primary" "$PRIMARY" "git diff main...HEAD"
expect_allow "git fetch in primary" "$PRIMARY" "git fetch origin"
expect_allow "git worktree list in primary" "$PRIMARY" "git worktree list"
expect_allow "worktree.sh new in primary" "$PRIMARY" ".claude/scripts/worktree.sh new some-topic"
expect_allow "cat, grep and ls in primary" "$PRIMARY" "cat README.md | grep -n x; ls -la src"
expect_allow "redirect to /tmp and /dev/null in primary" "$PRIMARY" "npm test > /tmp/out.txt 2>&1; ls > /dev/null"

# False positives that are now allowed.
expect_allow "> inside a heredoc body" "$PRIMARY" "cat <<EOF > /tmp/x${nl}> quoted line${nl}> README.md${nl}EOF"
expect_allow "> inside a quoted heredoc body" "$PRIMARY" "cat <<'EOF' > /tmp/x${nl}echo y > README.md${nl}EOF"
expect_allow "> inside single quotes" "$PRIMARY" "printf '%s\\n' 'npm test > out.txt'"
expect_allow "> inside double quotes" "$PRIMARY" "echo \"a > README.md\""
expect_allow "git commit text inside a quoted grep pattern" "$PRIMARY" "grep -rn 'git commit' scripts"
expect_allow "cd to an unresolvable target, then commit" "$PRIMARY" "cd \"\$WT\" && git commit -m x"
expect_allow "cd to an unresolvable target, then redirect" "$PRIMARY" "cd \"\$WT\" && echo x > README.md"

# Mutations in the primary checkout stay denied, and the listed bypasses are closed.
expect_deny "git commit in primary" "$PRIMARY" "git commit -m x"
expect_deny "git switch in primary" "$PRIMARY" "git switch -c topic"
expect_deny "redirect into README.md in primary" "$PRIMARY" "echo x > README.md"
expect_deny "quoted redirect target in primary" "$PRIMARY" "echo x >> \"README.md\""
expect_deny "heredoc written into primary" "$PRIMARY" "cat > README.md <<EOF${nl}x${nl}EOF"
expect_deny "sed -i in primary" "$PRIMARY" "sed -i '' 's/a/b/' README.md"
expect_deny "git -C elsewhere, then git commit" "$PRIMARY" "git -C /tmp status; git commit -m x"
expect_deny "tee README.md" "$PRIMARY" "echo x | tee README.md"
expect_deny "tee -a README.md" "$PRIMARY" "echo x | tee -a README.md"
expect_deny "cp x README.md" "$PRIMARY" "cp /tmp/x README.md"
expect_deny "mv out of primary" "$PRIMARY" "mv README.md /tmp/README.md"
expect_deny "git branch -f main" "$PRIMARY" "git branch -f main HEAD~1"
expect_deny "git push origin HEAD:main" "$PRIMARY" "git push origin HEAD:main"
expect_deny "git pull" "$PRIMARY" "git pull"
expect_deny "git pull after a chain" "$PRIMARY" "git fetch && git pull --rebase"
expect_deny "bash -c with a commit" "$PRIMARY" "bash -c 'git commit -m x'"
expect_deny "absolute redirect into primary from /tmp" "/tmp" "echo x > $PRIMARY/README.md"
expect_deny "git -C primary commit from /tmp" "/tmp" "git -C $PRIMARY commit -m x"

# Linked worktree on a non-main branch: everything allowed except moving main.
wt="$tmp/linked-wt-bash"
if git -C "$ROOT" worktree add -q --detach "$wt" HEAD >/dev/null 2>&1; then
  expect_allow "git commit in a linked worktree" "$wt" "git add -A && git commit -m x"
  expect_allow "redirect in a linked worktree" "$wt" "echo x > README.md; sed -i '' 's/a/b/' README.md"
  expect_allow "cp and tee in a linked worktree" "$wt" "cp /tmp/x README.md; echo x | tee README.md"
  expect_allow "git branch -f topic in a linked worktree" "$wt" "git branch -f topic HEAD"
  expect_allow "git push of a topic branch" "$wt" "git push -u origin topic"
  expect_allow "cd from primary into a linked worktree, then commit" "$PRIMARY" "cd $wt && git commit -m x"
  expect_deny "git push origin HEAD:main from a linked worktree" "$wt" "git push origin HEAD:main"
  expect_deny "git push origin main from a linked worktree" "$wt" "git push origin main"
  expect_deny "git -C primary commit from a linked worktree" "$wt" "git -C $PRIMARY commit -m x"
  expect_deny "resolvable cd into primary, then commit" "$wt" "cd $PRIMARY && git commit -m x"
  git -C "$ROOT" worktree remove --force "$wt" >/dev/null 2>&1
else
  check "branch-guard linked-worktree Bash cases (could not create one)" 1
fi

# A separate clone (own .git directory) is never gated, even when the hook copy
# that runs is the clone's own, as a relative hook path would pick it.
clone="$tmp/scratch-clone"
if git clone -q --no-checkout "$ROOT" "$clone" >/dev/null 2>&1; then
  mkdir -p "$clone/.claude/hooks"
  cp "$ROOT/.claude/hooks/branch-guard.sh" "$clone/.claude/hooks/branch-guard.sh"
  expect_allow "git commit in a separate clone" "$clone" "git commit -m x" "$clone/.claude/hooks/branch-guard.sh"
  expect_allow "redirect in a separate clone" "$clone" "echo x > README.md; cp /tmp/x b.txt" "$clone/.claude/hooks/branch-guard.sh"
  out=$(printf '%s' "{\"tool_input\":{\"file_path\":\"$clone/README.md\"}}" | CLAUDE_PROJECT_DIR="$ROOT" bash "$clone/.claude/hooks/branch-guard.sh" 2>/dev/null)
  check "branch-guard allows edits in a separate clone" $([ -z "$out" ] && echo 0 || echo 1)
else
  check "branch-guard separate-clone cases (could not clone)" 1
fi

# PostToolUse persona sync hook: runs the sync script of the checkout that holds
# the edited file, not of the session's working directory.
sync_cmd=$(jq -r '.hooks.PostToolUse[]? | select(.matcher == "Write|Edit") | .hooks[].command' "$ROOT/.claude/settings.json" 2>/dev/null | head -1)
wt="$tmp/linked-wt-sync"
if [ -n "$sync_cmd" ] && git -C "$ROOT" worktree add -q --detach "$wt" HEAD >/dev/null 2>&1; then
  printf '\nSync hook probe line.\n' >> "$wt/agent/ose-researcher.md"
  out=$(jq -n --arg f "$wt/agent/ose-researcher.md" '{tool_input: {file_path: $f}}' \
    | (cd "$tmp" && CLAUDE_PROJECT_DIR="$ROOT" bash -c "$sync_cmd") 2>/dev/null)
  check "persona sync hook reports sync-agent" $(printf '%s' "$out" | jq -e '.systemMessage | contains("sync-agent")' >/dev/null 2>&1 && echo 0 || echo 1)
  check "persona sync hook regenerates the plugin copy of the edited checkout" $(grep -q 'Sync hook probe line.' "$wt/plugins/ose-knowledge/agents/ose-researcher.md" 2>/dev/null && echo 0 || echo 1)
  check "persona sync hook leaves the session checkout alone" $(grep -q 'Sync hook probe line.' "$ROOT/plugins/ose-knowledge/agents/ose-researcher.md" 2>/dev/null && echo 1 || echo 0)
  out=$(jq -n --arg f "$wt/README.md" '{tool_input: {file_path: $f}}' | (cd "$tmp" && CLAUDE_PROJECT_DIR="$ROOT" bash -c "$sync_cmd") 2>/dev/null)
  check "persona sync hook ignores other files" $([ -z "$out" ] && echo 0 || echo 1)
  git -C "$ROOT" worktree remove --force "$wt" >/dev/null 2>&1
else
  check "persona sync hook (no PostToolUse hook, or could not create a worktree)" 1
fi

[ "$fails" -eq 0 ]
