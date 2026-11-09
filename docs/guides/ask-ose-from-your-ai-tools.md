---
title: "Ask OSE from your AI tools"
description: "Connect the OSE knowledge base to your AI assistant as an MCP server, a Claude Code plugin or a Codex plugin."
---

The OSE knowledge base searches these docs and answers questions about OSE with cited sources. You can ask it in the chat at [Ask OSE](/ask/), or connect it to your own AI assistant. The knowledge base then runs on your own computer, so OSE does not see your questions.

All three ways start the knowledge base with `uvx`, so install [uv](https://docs.astral.sh/uv/) first.

## Use it as an MCP server

Add the server to any MCP client, such as Claude Code, Cursor or Claude Desktop. In Claude Code, run this command:

```bash
claude mcp add ose-knowledge -- uvx ose-knowledge-mcp==0.12.15
```

For another client, put this in the client's configuration:

```json
{
  "mcpServers": {
    "ose-knowledge": {
      "type": "stdio",
      "command": "uvx",
      "args": ["ose-knowledge-mcp==0.12.15"]
    }
  }
}
```

The version is fixed, so you always get a known build. Each OSE release updates the version on this page.

## Use it as a Claude Code plugin

The plugin adds the MCP server, an `ose-researcher` agent and an `ask-about-ose` skill. The skill sends your OSE questions to the agent. You can also call the skill as `/ose-knowledge:ask-about-ose`.

```text
/plugin marketplace add opensourceeurope/ose-ai
/plugin install ose-knowledge@ose-ai
```

## Use it as a Codex plugin

The same plugin installs in Codex with the MCP server and the `ask-about-ose` skill. Codex does not load the `ose-researcher` agent, so the skill searches the knowledge base itself.

```bash
codex plugin marketplace add opensourceeurope/ose-ai
```

Then run `/plugins` in Codex, install `ose-knowledge` and start a new session. To install from the terminal instead, run `codex plugin add ose-knowledge@ose-ai` and start a new session.
