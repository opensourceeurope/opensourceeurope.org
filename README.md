# opensourceeurope.org

The source of the [Open Source Europe](https://opensourceeurope.org) website. It is a static Astro site, hosted on Scaleway. All page text, links and image references live in `src/content/`.

## Commands

Copy `.env.example` to `.env` first. `PUBLIC_CONTACT_ENDPOINT` and `PUBLIC_CHAT_ENDPOINT` are required and have no default. `.env` is gitignored. Node 22.23.4 or later, the version Astro requires. CI uses the exact version in `.node-version`.

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies and points git at `.githooks`. |
| `npm run dev` | Starts the dev server. |
| `npm run dev:function` | Runs the contact form function on port 8081. It writes messages to `test-results/outbox.jsonl` instead of sending them. |
| `npm run build` | Builds the static site into `dist/`. |
| `npm run preview` | Serves `dist/`. |
| `npm run check` | Type check with `astro check`. |
| `npm test` | Unit tests with Vitest. |
| `npm run dev:chat` | Starts the MCP server and the chat function locally, without the site. Needs `uv` and Ollama. |
| `npm run test:e2e` | End-to-end and accessibility tests with Playwright. Run `npx playwright install chromium` once. The tests build the site and set `PUBLIC_CONTACT_ENDPOINT` themselves. |
| `npm run licences` | Checks the licence of every installed package, in the site and in `functions/chat`, against the allowlist in `scripts/check-licences.mjs`. Exceptions go in `licence-exceptions.json`, each with a reason. |
| `npx lhci autorun --config=lighthouserc.mobile.json` | Lighthouse budgets on every route (use `lighthouserc.desktop.json` for desktop). Run `npm run build` first. |
| `bash scripts/check-coauthors.sh <base> <head>` | Fails when a commit in the range has an agent `Co-authored-by` trailer. |
| `npm ci --prefix functions/chat && npm test --prefix functions/chat` | Installs and tests the chat function. |
| `npm run build:function` | Bundles the contact form function for deployment. See `docs/deployment.md`. |
| `npm run drift` | Compares the text of every page with the live site. Run `npm run build && npm run preview` first. Accepted differences are in `tests/fixtures/live/allowed-diffs.json`. |
| `npm run capture` | Captures text, images and screenshots from the live site into `tests/fixtures/live/` and `reference/`. |
| `bash scripts/test-harness.sh` | Tests the agent hooks and scripts. |

## Knowledge base

The repository also holds the OSE knowledge base. It indexes the OSE handbook and internal operations docs and answers questions about them with cited sources. It is built with [OpenCrane](https://github.com/derberg/OpenCrane). There are three ways to use it: the MCP server, the plugin for Claude Code and Codex, and the chat. The chat runs on the site at `/ask/`, and a button on every page opens it in a panel. https://ask.opensourceeurope.org redirects to `/ask/`.

Where the parts live:

| Part | Path |
|---|---|
| Index inputs and the committed index | `.opencrane/` |
| MCP server image and scripts | `.opencrane/`, `scripts/knowledge/` |
| Plugin for Claude Code and Codex | `plugins/ose-knowledge/` |
| Agent persona (source of the plugin copy) | `agent/ose-researcher.md` |
| Chat function | `functions/chat/` |
| The `/ask/` page | `src/pages/ask.astro` |
| The Ask panel fragment, fetched on first open | `src/pages/ask/panel.html.ts` |
| Chat components | `src/components/chat/` |
| Chat client scripts | `src/scripts/chat/` |
| Docs | `docs/knowledge/` |

### Use it as an MCP server

The server starts with `uvx`, so install [uv](https://docs.astral.sh/uv/) first. Then add the server to any MCP client (Claude Code, Cursor, Claude Desktop and others):

```bash
claude mcp add ose-knowledge -- uvx ose-knowledge-mcp==0.9.1
```

Or put this in the client's config:

```json
{
  "mcpServers": {
    "ose-knowledge": { "type": "stdio", "command": "uvx", "args": ["ose-knowledge-mcp==0.9.1"] }
  }
}
```

The version is pinned on purpose, so you always get a known build. A release script updates both snippets. See `docs/knowledge/automation.md`.

### Use it as a Claude plugin

The plugin adds the MCP server, an `ose-researcher` agent and an `ask-about-ose` skill. The skill sends OSE questions to the agent. You can also call it as `/ose-knowledge:ask-about-ose`.

The MCP server starts with `uvx`, so install [uv](https://docs.astral.sh/uv/) before you install the plugin.

```
/plugin marketplace add opensourceeurope/ose-ai
/plugin install ose-knowledge@ose-ai
```

### Use it as a Codex plugin

The same plugin installs in Codex with the MCP server and the `ask-about-ose` skill. Codex doesn't load the `ose-researcher` agent, so the skill calls `search_docs` directly there.

The MCP server starts with `uvx`, so install [uv](https://docs.astral.sh/uv/) before you install the plugin.

```bash
codex plugin marketplace add opensourceeurope/ose-ai
```

Then run `/plugins` in Codex, install `ose-knowledge`, and start a new session. To install from the terminal instead, run `codex plugin add ose-knowledge@ose-ai` and start a new session.

### Run the chat locally

One command starts the MCP server, the chat function and the site (`astro dev`). It runs offline against a local [Ollama](https://ollama.com), so it needs no API key. You need [`uv`](https://docs.astral.sh/uv/), Ollama and Node 22.

```bash
brew install uv ollama         # macOS
ollama serve &                 # or open the Ollama app
ollama pull mistral-small3.2   # once, the default local model
scripts/knowledge/run-local.sh # starts astro dev on 4321 and opens /ask/
```

The first run builds the embeddings index, which takes a few minutes. Pass `--fresh` to rebuild it. For a hosted model or other settings, see `functions/chat/README.md`.

More docs are in `docs/knowledge/`: `architecture.md`, `knowledge-pipeline.md`, `deploy-scaleway.md`, `deploy-chat.md`, `chat-cost.md` and `automation.md`.

## Troubleshooting

- After you change a content schema, the build can report stale entries. Delete `node_modules/.astro/data-store.json` and build again.
- `npm run test:e2e` starts its own contact function servers on ports 8081 and 8082. Stop any `npm run dev:function` first, or the tests fail to start.
- In a worktree under `.worktrees/`, the build can fail with `Tsconfig not found astro/tsconfigs/strict`. The primary checkout's own `tsconfig.json` sits above the worktree, with no `node_modules` beside it. The same commit builds in a clone outside the repository folder.
- Outside CI, `npm run test:e2e` reuses any server that already answers on port 4321, even a preview of another worktree with an older build. Stop that preview first with `npx astro preview stop` in its folder.

## Licences

| Path | Licence |
|---|---|
| `src/content/**`, `src/assets/uploads/**`, `public/app/uploads/**`, `docs/**` including `docs/knowledge/**` | CC-BY-4.0 (`LICENSE-CONTENT`) |
| `.opencrane/llmstxt/**`, `.opencrane/chunks.json`, `.opencrane/milvus.db`, `.opencrane/embeddings.json` | CC-BY-4.0 (`LICENSE-CONTENT`) |
| `agent/**`, `plugins/**` | MIT (`LICENSE`) |
| `public/fonts/**` | OFL-1.1 |
| `src/assets/theme/**` | Used with the permission of the design agency that made them, confirmed on 2026-10-28. No open licence is claimed |
| `public/images/ose-logo.svg` | OSE's mark. Not MIT and not CC-BY-4.0 |
| Everything else | MIT (`LICENSE`) |

Third-party logos in the logo sections belong to their owners and remain their trademarks.

## Planned

- A blog at `/blog/` with an RSS feed at `/rss.xml`.
- Starlight documentation at `/docs/`.
- Pages built at build time from APIs.

## AI policy

Agents are assistants, never co-authors. Commits carry no agent `Co-authored-by` trailer. Disclose AI use with a `Generated-by:` line in the pull request. See `AGENTS.md`.
