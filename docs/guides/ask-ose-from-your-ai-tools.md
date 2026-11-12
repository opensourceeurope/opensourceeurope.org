---
title: "Ask OSE from your AI tools"
description: "Connect the OSE knowledge base to your AI assistant as an MCP server, a Claude Code plugin or a Codex plugin."
---

The OSE knowledge base searches these docs and answers questions about OSE with cited sources. You can ask it in the chat at [Ask OSE](/ask/), or connect it to your own AI assistant. The knowledge base then runs on your own computer, so OSE does not see your questions.

All three ways start the knowledge base with `uvx`, so install [uv](https://docs.astral.sh/uv/) first.

## Use it as an MCP server

Add the server to any MCP client, such as Claude Code, Cursor or Claude Desktop. In Claude Code, run this command:

```bash
claude mcp add ose-knowledge -- uvx ose-knowledge-mcp==0.13.6
```

For another client, put this in the client's configuration:

```json
{
  "mcpServers": {
    "ose-knowledge": {
      "type": "stdio",
      "command": "uvx",
      "args": ["ose-knowledge-mcp==0.13.6"]
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

## Give the docs to any AI tool

An AI tool that reads web pages can also use the docs without the knowledge base. Point it at one of these files:

- [llms.txt](https://opensourceeurope.org/llms.txt) lists the pages of the website and the docs, with a short description of each.
- [llms-full.txt](https://opensourceeurope.org/llms-full.txt) holds the text of every docs page in one file, with the address of each page.
- Each docs page also has a Markdown copy. Replace the slash at the end of its address with `.md`, as in [basics.md](https://opensourceeurope.org/docs/how-it-works/basics.md).

llms.txt and llms-full.txt follow the [llms.txt format](https://llmstxt.org).
