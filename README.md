# opensourceeurope.org

The source of the [Open Source Europe](https://opensourceeurope.org) website. All page text, links and image references live in `src/content/`.

## Knowledge base

The repository also holds the OSE knowledge base. It searches the OSE docs and internal operations docs and answers questions about them with cited sources. It is built with [OpenCrane](https://github.com/derberg/OpenCrane). You can use it in the chat at [opensourceeurope.org/ask/](https://opensourceeurope.org/ask/), or connect it to your AI assistant as an MCP server or a plugin for Claude Code and Codex. To set it up, see [Ask OSE from your AI tools](https://opensourceeurope.org/docs/guides/ask-ose-from-your-ai-tools/).

## Contribute to the site

To change page text, edit the file for that page in `src/content/`. The [Editing content](AGENTS.md#editing-content) section of AGENTS.md lists the file for each page. Docs pages are in `docs/` and blog posts in `src/content/blog/`. To build, test or release the site and the knowledge base, see [DEVELOPMENT.md](DEVELOPMENT.md).

For a small fix, use "Edit page" at the bottom of a docs page or blog post and edit the file on GitHub. For more, clone the repository and open it in Claude Code: it reads [AGENTS.md](AGENTS.md), and the [docs-authoring skill](.claude/skills/docs-authoring/SKILL.md) covers the page format, the preview, the checks and the commit type. The [humanize skill](.claude/skills/humanize/SKILL.md) is the last pass over new text, so it reads like a person wrote it.

## Licences

The following table lists the licence for each path:

| Path | Licence |
|---|---|
| `src/content/**`, `src/assets/uploads/**`, `public/app/uploads/**`, `docs/**`, `dev-guide/**` | CC-BY-4.0 (`LICENSE-CONTENT`) |
| `.opencrane/llmstxt/**`, `.opencrane/chunks.json`, `.opencrane/milvus.db`, `.opencrane/embeddings.json` | CC-BY-4.0 (`LICENSE-CONTENT`) |
| `agent/**`, `plugins/**` | MIT (`LICENSE`) |
| `public/fonts/**` | OFL-1.1 |
| `src/assets/theme/**` | Used with the permission of the design agency that made them, confirmed on 2026-10-28. No open licence is claimed |
| `public/images/ose-logo.svg` | OSE's mark. Not MIT and not CC-BY-4.0 |
| Everything else | MIT (`LICENSE`) |

Third-party logos in the logo sections belong to their owners and remain their trademarks.

## Planned

The following parts of the site are planned:

- Pages built at build time from APIs.

