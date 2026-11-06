# AGENTS.md

Instructions for coding agents working on opensourceeurope.org. Humans can read it too.

## Stack

Astro (static output, TypeScript strict), content in `src/content/`, the documentation at `/docs/` built by Starlight from Markdown in `src/content/docs/`, a Scaleway Serverless Function for the contact form under `functions/`, hosting on Scaleway Object Storage. The repository also holds the OSE knowledge base: an OpenCrane index in `.opencrane/` served as an MCP server (`ose-knowledge-mcp` on PyPI), a Claude plugin in `plugins/ose-knowledge/`, the agent persona in `agent/`, a chat function in `functions/chat/` (its own `package.json`, Node 22) and the chat UI on the site (`/ask/` and the Ask panel). Target Node 22. Every workflow reads the exact version from `.node-version`, because `node-version: 22` takes whatever the runner has cached, and some runner images cache a version older than Astro accepts. This file and `docs/` are the authority for how the site and the knowledge base are built.

## Commands

Copy `.env.example` to `.env` before `build` or `check`.

```bash
npm run dev        # dev server
npm run dev:chat       # MCP server and chat function locally, no site; needs uv and Ollama
npm run dev:function   # contact form function on port 8081, writes to test-results/outbox.jsonl; ignores SMTP_TOKEN unless DEV_ALLOW_SMTP=1
npm run build      # static build into dist/
npm run preview    # serves dist/ on port 4321
npm run build:function # bundles the contact form function
npm run check      # astro check
npm test           # Vitest unit tests
npm run test:e2e   # Playwright (builds and previews the site)
npm run licences   # licence check of installed packages, site and functions/chat
npm ci --prefix functions/chat && npm run build --prefix functions/chat && npm test --prefix functions/chat   # chat function tests
scripts/knowledge/sync-agent.sh [--check]   # copies agent/ose-researcher.md into the plugin
uv run --no-project --python 3.12 --with pyyaml==6.0.2 python scripts/knowledge/docs-to-llms.py   # exports the docs for opencrane fetch
scripts/knowledge/ensure-index.sh [--check] # regenerates or checks the committed index
scripts/knowledge/run-local.sh [--fresh]    # runs MCP server, chat function and page locally, needs uv and Ollama
npm run drift      # text comparison with the live site; needs the preview running
npm run capture    # captures text, images and screenshots from the live site
npx lhci autorun --config=lighthouserc.mobile.json   # Lighthouse budgets (also lighthouserc.desktop.json); build first
bash scripts/check-coauthors.sh <base> <head>   # agent co-author trailer check
bash scripts/test-harness.sh   # agent harness tests
```

Troubleshooting:

- After you change a content schema, the build can report stale entries. Delete `node_modules/.astro/data-store.json` and build again.
- `npx playwright test` starts its own contact function servers on ports 8081 and 8082. Stop any `npm run dev:function` first.
- In a worktree under `.worktrees/`, the build can fail with `Tsconfig not found astro/tsconfigs/strict`. The primary checkout's own `tsconfig.json` sits above the worktree, with no `node_modules` beside it. The same commit builds in a clone outside the repository folder.
- Outside CI, `npm run test:e2e` reuses any server that already answers on port 4321, even a preview of another worktree with an older build. Stop that preview first with `npx astro preview stop` in its folder.
- Two worktrees cannot run `npm run test:e2e` at the same time, because `playwright.config.ts` fixes ports 4321, 8081 and 8082. Find the owner with `lsof -nP -i :4321`. If another session's run holds the ports, wait for it to finish instead of stopping it.
- From an agent session, `npm run test:e2e` can stop with `Process from config.webServer exited early`. With the agent variables set, `astro preview` moves to the background, and Playwright reads that as a stopped server. Run it as `env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT npm run test:e2e`.

## Worktree rule

The primary checkout is read-only for edits, and nothing is committed to `main`. Every change happens in a worktree on its own branch and reaches `main` through a pull request.

```bash
.claude/scripts/worktree.sh new <topic>   # creates .worktrees/<topic>
```

`.claude/hooks/branch-guard.sh` denies edits in the primary checkout and on `main`. For Bash commands it denies clear mutations of the primary checkout (git commands that move HEAD, stage or pull, redirections, `sed -i`, `tee`, `cp` and `mv` into it) and, from any checkout, pushing to `main` or moving the `main` branch. Read-only commands pass, and a separate clone of the repository is never gated. It fails open on commands it cannot parse. Run `git config core.hooksPath .githooks` once per clone to enable the commit-msg hook.

## Quality gates

Before you hand off a change, these must pass (the commands are under Commands above): type check and build, unit tests, end-to-end tests, the accessibility scan on every route, the licence check, and `bash scripts/test-harness.sh`.

## Global constraints

- No HTML, CSS, JS or templates copied from the old WordPress site. It is a visual and behavioural reference only.
- No request to a third-party domain on page load. No cookies. The only browser storage is the consent choice.
- No jQuery, GSAP or Owl Carousel, and no library from a public CDN.
- Every animation respects `prefers-reduced-motion: reduce`. Content is fully visible without JavaScript.
- WCAG 2.1 AA is the floor: axe reports zero violations on every route.
- The canonical origin is `https://opensourceeurope.org`, set once as Astro `site`. Routes end with a slash.
- Image paths under `/app/uploads/` and the favicon paths stay as they are.
- Page text, links, image references and SEO fields live in `src/content/`, never in components.
- Every deliberate difference from the live site gets a row in `docs/migration-notes.md`.
- Code is MIT, OSE content is CC-BY-4.0, Manrope is OFL-1.1, and third-party logos stay their owners' trademarks.
- GitHub Actions are pinned to commit SHAs with a version comment, and installed tools to versions (skill `github-actions-supply-chain-pinning`).

## AI policy

Agents are assistants, never co-authors. Never add a `Co-authored-by` trailer that names an agent, and add no agent attribution to commit messages. Disclose AI use with a `Generated-by:` line in the pull request. `.githooks/commit-msg`, `.claude/hooks/no-agent-coauthor.sh` and `scripts/check-coauthors.sh` enforce this.

## Knowledge base

Do not quietly undo these.

- **The agent persona lives in `agent/ose-researcher.md`.** `scripts/knowledge/sync-agent.sh` copies it into `plugins/ose-knowledge/agents/ose-researcher.md`, and CI fails when the two drift. Edit the source, then sync. Never edit the plugin copy. A `PostToolUse` hook in `.claude/settings.json` runs the sync after an edit to either file, in the checkout that holds the file. The `<!-- SOURCE-NOTE -->` block in the source is stripped from both generated outputs.
- **`.opencrane/embeddings.json` and `.opencrane/milvus.db` are committed build artifacts.** The index is regenerated only when the chunks change, by the knowledge refresh (`refresh.yml`) or by a pull request that edits `chunks.json` or the chunking config. Run `scripts/knowledge/ensure-index.sh` and commit both files with the change. CI runs it with `--check` and fails a pull request that changed `chunks.json` without the index. Releases pack the committed `milvus.db`, so a release does no embedding. Do not add `opencrane embed` to the release path.
- **opencrane is version-locked in `.opencrane/opencrane-version`.** Every call is `uvx opencrane@<that version>`, never a floating `latest`. To upgrade, edit that one file and regenerate the index in the same pull request. The `fetch` and `chunk` steps need the extra: `uvx opencrane[pipeline]@<version>`. The `embed`, `index`, `serve` and `pack` steps use the plain form.
- **`.opencrane/constraints.txt` caps the dependencies opencrane leaves unpinned.** It holds `transformers<5.17`: 5.17.0 removed a method the `nomic-embed-text-v1.5` remote code calls, and every search fails. Every opencrane install passes it (`uvx --constraints` in the scripts and workflows, `pip install -c` in `.opencrane/Dockerfile`), and the release copies it into the published package with `scripts/knowledge/cap-pack-deps.sh`, which also pins the package to `opencrane==<.opencrane/opencrane-version>` instead of the `opencrane>=` that `opencrane pack` writes. `knowledge-ci.yml` fails an install that skips it. opencrane 0.35.0 declares the same cap, so the file is a second guard for now. To raise the cap, test the new version with `uvx --with 'transformers==X'` and a search, then edit the file. See `docs/knowledge/knowledge-pipeline.md`.
- **The chat UI has a design system.** Read `docs/knowledge/` before you change `/ask/` or the Ask panel. `scripts/knowledge/run-local.sh` starts `astro dev` for the `/ask/` page.
- **The knowledge refresh only commits content changes.** It commits as `fix:`, so release-please rolls the new content into the release pull request. It never deploys. Do not wire deploys back into it.
- **The chat function is in `functions/chat/`, with its own `package.json`.** Its tests run with `npm test --prefix functions/chat` after `npm ci --prefix functions/chat` and `npm run build --prefix functions/chat`. The build bundles the persona that the tests import, so a fresh clone fails without it.

## Documentation

Do not quietly undo these.

- **The docs moved from GitBook.** The pages in `src/content/docs/docs/` replace `https://docs.opencollective.com/open-source-europe` and are now the source. Edit them here, not in GitBook. `docs/migration-notes.md` lists what changed in the move (MN-059 to MN-061).
- **Starlight changes two site-wide settings, and `astro.config.mjs` restores them.** Starlight sets `scopedStyleStrategy: 'where'` and turns on `prefetch` for the whole site. With `'where'`, the site's component styles lose to the global grid rules and the services rows stack. The `keepSiteDefaults` integration runs after Starlight, turns prefetch off and sets the strategy to `'class'`, which has the site's old specificity. Do not use `'attribute'`: Starlight's styles for child components such as its icons then match nothing. Keep the integration after `starlight()` in the integrations list.
- **The docs store nothing in the browser.** Starlight keeps the theme in `localStorage` and the sidebar state in `sessionStorage`. The overrides in `src/components/docs/` (`ThemeProvider`, `ThemeSelect`, `Sidebar`) and the `noSidebarStorage` Vite plugin in `astro.config.mjs` remove both. The docs have one dark theme, like the site. Do not use `syncKey` on Starlight tabs, because it also writes to `localStorage`.
- **Docs pages share the site's consent banner and legal links.** `src/components/docs/SkipLink.astro` renders the consent banner first in the body, and `Footer.astro` adds the legal links from `footer.legal` in `site.yaml`, so the "Privacy settings" button that the privacy policy promises is on every page. `Head.astro` adds the `js` class, the default share image and the JSON-LD.
- **Every docs page is a tested route.** `tests/e2e/routes.ts` reads the sidebar from `docs.yaml`, so the quality and accessibility checks run on every page in the sidebar. `tests/unit/docs-content.test.ts` fails on a page missing from the sidebar, a missing description, an empty alt text, an empty link, a link to a docs page that does not exist, a link to a `.md` file, a file name that is not lower case with hyphens, a heading that starts with an emoji, and a body that does not start at `##` or skips a heading level.
- **Deploys fetch the full git history.** The docs show each page's "Last updated" date from git, so `deploy-site.yml` checks out with `fetch-depth: 0`. A shallow clone gives every page the date of the release commit.
- **The Ask chat reads these files.** The `open-source-europe` source in `.opencrane/config.yaml` is a local export that `scripts/knowledge/docs-to-llms.py` writes from `src/content/docs/`, so run that script before `opencrane fetch`. `refresh.yml` does, every Saturday and on every push to `main` that changes the docs, `docs.yaml` or the script. Answers cite `https://opensourceeurope.org/docs/...`. Only the internal Open Collective Europe space still comes from GitBook. See `docs/knowledge/knowledge-pipeline.md`.

## Releases

Releases are cut by release-please. Do not tag by hand and do not bump a version by hand. The site, the MCP package on PyPI, the MCP container and the chat function release together under one `vX.Y.Z` tag.

- Conventional commits on `main` drive the version: `fix:` is a patch, `feat:` is a minor, `feat!:` or a `BREAKING CHANGE:` footer is a major.
- `docs:`, `chore:`, `ci:`, `refactor:` and `test:` commits do not cause a release.
- `commitlint` fails a pull request whose commits are not conventional, because a wrong type silently skips the release.
- release-please keeps one release pull request open. It merges itself once CI is green, then the tag is created and the release workflow publishes to PyPI and deploys. To hold a release, mark that pull request as draft or turn off its auto-merge.
- Deploys happen only on a release. There is no preview environment for a pull request. Review the diff and CI.

release-please owns these files. Do not edit them by hand:

- `CHANGELOG.md` and `plugins/ose-knowledge/CHANGELOG.md` (a pointer to the root file).
- The `version` in `plugins/ose-knowledge/.claude-plugin/plugin.json` and `plugins/ose-knowledge/plugin.json`.
- The `ose-knowledge-mcp==` pin in `plugins/ose-knowledge/.mcp.json`, `plugins/ose-knowledge/mcp.json`, `src/content/pages/ask.yaml` and `README.md`. `scripts/knowledge/sync-mcp-version.sh` rewrites them on the release pull request. Contributors must not hand-edit the pin in `ask.yaml`.
- `.release-please-manifest.json`, the version state file. It is plain JSON and cannot hold comments.
- Git tags and GitHub Releases.

To change a version, land a conventional commit.

## Planned

- A blog at `/blog/` with an RSS feed at `/rss.xml`.
- Pages built at build time from APIs.

## Editing content

The site text is in `src/content/`, one file per page or section. Open the file for the page you want to change and edit the text, links or image references there. Components hold no copy.

1. Start from a worktree: `.claude/scripts/worktree.sh new <topic>`.
2. Run `npm run dev` and check the page in the browser.
3. Commit on the topic branch and open a pull request. Add the `Generated-by:` line if an agent helped.

A change goes live only with a release. Use a `fix:` or `feat:` commit for a change to site text. A `docs:`, `chore:`, `ci:`, `refactor:` or `test:` commit does not cause a release, so its change stays unpublished until the next release. The release pull request merges itself when CI passes. See Releases above.

Where each page lives:

- Home: `src/content/pages/home.yaml`.
- Sections that several pages share (eligibility, funders, FAQ, the closing call to action): `src/content/shared/`.
- About: `src/content/pages/about.yaml`.
- Services: `src/content/pages/services.yaml`. Each service page, and its row on the services page: `src/content/services/<slug>.yaml`. The file name is the last part of the page's path.
- How to join: `src/content/pages/how-to-join.yaml`.
- Legal pages: `src/content/legal/<slug>.md`, one Markdown file per page. The file name is the page's path.
- The 404 page: `src/content/pages/404.yaml`.
- Contact, including the form labels and the messages it shows: `src/content/pages/contact.yaml`. The interest options there must match `INTEREST_OPTIONS` in `functions/contact/src/fields.ts`. Change both together, and redeploy the function. A unit test fails when they differ.
- Ask page (`/ask/`): `src/content/pages/ask.yaml`. The chat texts are under `chat` in `src/content/settings/site.yaml`.
- Documentation (`/docs/`): one Markdown file per page in `src/content/docs/docs/`. The sidebar, the docs header title and its links are in `src/content/settings/docs.yaml`. The skill in `.claude/skills/docs-authoring/` covers page format, preview and checks.
- Header, footer, navigation, the consent banner text, the site name and the default share image: `src/content/settings/site.yaml`.
- Uploaded images: `src/assets/uploads/` and `public/app/uploads/`. Theme images, such as backgrounds: `src/assets/theme/`.
