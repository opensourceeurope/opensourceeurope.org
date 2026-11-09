# Development guide

This guide is for the maintainers of the Open Source Europe website and the OSE knowledge base. It explains how to set up, run and test the project. Coding agents follow [AGENTS.md](AGENTS.md), which also holds the release rules and the content file for each page.

## Set up the project

The site is a static Astro site, hosted on Scaleway. You need Node 22.23.4 or later, the version Astro requires. CI uses the exact version in `.node-version`. Run `npm install`, then copy `.env.example` to `.env`. `PUBLIC_CONTACT_ENDPOINT` and `PUBLIC_CHAT_ENDPOINT` are required and have no default. Git ignores `.env`.

## Commands

The following table lists the commands and what each one does:

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
| `npm run build:function` | Bundles the contact form function for deployment. See `dev-guide/deployment.md`. |
| `bash scripts/test-harness.sh` | Tests the agent hooks and scripts. |

## Knowledge base

The knowledge base parts are in several folders of this repository. To use the knowledge base as an MCP server or a plugin, see the [Knowledge base](README.md#knowledge-base) section of the README.

The following table lists where each part lives:

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
| Docs | `dev-guide/knowledge/` |

### Run the chat locally

One command starts the MCP server, the chat function and the site (`astro dev`). It runs offline against a local [Ollama](https://ollama.com), so it needs no API key. You need [`uv`](https://docs.astral.sh/uv/), Ollama and Node 22.

```bash
brew install uv ollama         # macOS
ollama serve &                 # or open the Ollama app
ollama pull mistral-small3.2   # once, the default local model
scripts/knowledge/run-local.sh # starts astro dev on 4321 and opens /ask/
```

The first run builds the embeddings index, which takes a few minutes. Pass `--fresh` to rebuild it. For a hosted model or other settings, see `functions/chat/README.md`.

For the rest of the knowledge base guides, see [More guides](#more-guides).

## More guides

The longer guides for maintainers are in `dev-guide/`. The pages of the public documentation at `/docs/` are in `docs/`. To change them, see [Editing content](AGENTS.md#editing-content).

The following table lists each guide in `dev-guide/`:

| Guide | What it covers |
|---|---|
| [Deployment](dev-guide/deployment.md) | Hosting on Scaleway, the deploy workflows, variables and secrets |
| [Animation inventory](dev-guide/animations.md) | Every animated or interactive effect and the values the site matches |
| [Architecture](dev-guide/knowledge/architecture.md) | The MCP server and the public chat on top of it |
| [Knowledge pipeline](dev-guide/knowledge/knowledge-pipeline.md) | How OpenCrane fetches, chunks and indexes the OSE docs |
| [Deploying the MCP server](dev-guide/knowledge/deploy-scaleway.md) | The Scaleway Serverless Container that serves the MCP server |
| [Deploying the chat](dev-guide/knowledge/deploy-chat.md) | The chat function and how it is deployed |
| [Chat cost](dev-guide/knowledge/chat-cost.md) | What the public chat costs to run and how to measure it again |
| [Automation](dev-guide/knowledge/automation.md) | The CI, refresh, release and deploy workflows |

## Troubleshooting

The following problems can come up in local builds and tests:

- After you change a content schema, the build can report stale entries. Delete `node_modules/.astro/data-store.json` and build again.
- `npm run test:e2e` starts its own contact function servers on ports 8081 and 8082. Stop any `npm run dev:function` first, or the tests fail to start.
- In a worktree under `.worktrees/`, the build can fail with `Tsconfig not found astro/tsconfigs/strict`. The primary checkout's own `tsconfig.json` sits above the worktree, with no `node_modules` beside it. The same commit builds in a clone outside the repository folder.
- Outside CI, `npm run test:e2e` reuses any server that already answers on port 4321, even a preview of another worktree with an older build. Stop that preview first with `npx astro preview stop` in its folder.

## AI policy

Agents are assistants, never co-authors. Commits carry no agent `Co-authored-by` trailer. Disclose AI use with a `Generated-by:` line in the pull request. See [AGENTS.md](AGENTS.md).
