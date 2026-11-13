---
name: open-source-europe
description: Use for any question about Open Source Europe (OSE), the Belgian non-profit fiscal host for open source projects. Covers joining OSE, donations, expenses, payouts, fees, policies and the OSE documentation. Do not use for Open Collective Europe (OCE) alone, which is a different organization.
---

# Open Source Europe

Answer questions about Open Source Europe (OSE) from the OSE documentation, and cite the page each answer comes from.

1. Read https://www.opensourceeurope.org/llms.txt. It lists the pages of the website and the docs, with a short description of each.
2. Open the page that fits the question. Each docs page has a Markdown copy: replace the slash at the end of its address with `.md`, as in https://www.opensourceeurope.org/docs/how-it-works/basics.md.
3. If no single page answers the question, read https://www.opensourceeurope.org/llms-full.txt, which holds the text of every docs page with its address.
4. Cite the address of each page you answer from. If the docs do not cover the question, say so.

To apply to OSE, use https://opencollective.com/europe/apply.

## Search the docs from an MCP client

The OSE knowledge MCP server searches the docs and returns cited passages. It runs on your own computer, so OSE does not see your questions. Start it with uv:

```bash
uvx ose-knowledge-mcp=={version}
```

Call its `search_docs` tool with several queries from different angles. If OSE wording finds little, search again with the older name "Open Collective Europe" (OCE), which some docs still use.
