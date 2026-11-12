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
      "RELEASES: use fix: or feat: when the pull request changes anything a release publishes: the site UI and text, " +
      "the docs (docs/), the knowledge base (.opencrane/, agent/) or the MCP server (plugins/ose-knowledge/). " +
      "Use chore:, ci: or test: only for changes that publish nothing, such as tooling, tests and workflows.\n\n" +
      "AI POLICY: agents are assistants, never co-authors. Never add a Co-authored-by trailer naming an agent " +
      "and no agent attribution in commit messages. AI use is disclosed with a Generated-by: line in the pull request."
    )
  }
}'
