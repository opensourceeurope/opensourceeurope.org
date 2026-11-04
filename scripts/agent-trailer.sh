#!/usr/bin/env bash
# Shared rule for the OSE AI policy: agents are assistants, never co-authors.
# Source this file, then call `is_agent_trailer <file>`; it exits 0 when the
# file holds a Co-authored-by line naming a known agent identity.
#
# The pattern lists identities, not broad substrings, so a human whose address
# contains "agent" (jane@agentur.de) or "gpt" is not caught. A name has to
# stand alone, not sit inside a longer word.

AGENT_NAMES='noreply@anthropic\.com|copilot@github\.com|cursoragent@cursor\.com|Claude|GitHub Copilot|Cursor Agent|Codex|Gemini|Devin|Aider'
AGENT_TRAILER_PATTERN="co-authored-by:.*(^|[^[:alnum:]])(${AGENT_NAMES})([^[:alnum:]]|\$)"

is_agent_trailer() {
  # Comment lines (git's "# ..." template text) never count.
  grep -v '^#' "$1" 2>/dev/null | grep -Eiq "$AGENT_TRAILER_PATTERN"
}
