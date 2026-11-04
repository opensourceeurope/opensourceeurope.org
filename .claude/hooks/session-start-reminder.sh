#!/usr/bin/env bash
# SessionStart hook: front-loads the rules so they are read before the first
# edit. The branch guard is the safety net; this is the instruction.
set -u

jq -n '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: (
      "OSE WEBSITE WORKFLOW (opensourceeurope.org):\n" +
      "Read AGENTS.md first. It holds the stack, commands, quality gates and Global Constraints.\n\n" +
      "The shared main checkout is read-only for edits. All work happens in an isolated git worktree: " +
      ".claude/scripts/worktree.sh new <topic>. If the branch guard denies an edit, create a worktree " +
      "and continue there. Do not `git switch -c` in the main checkout.\n\n" +
      "AI POLICY: agents are assistants, never co-authors. Never add a Co-authored-by trailer naming an agent " +
      "and no agent attribution in commit messages. AI use is disclosed with a Generated-by: line in the pull request."
    )
  }
}'
