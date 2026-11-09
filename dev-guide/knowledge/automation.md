# Automation

All CI/release/deploy automation lives in `.github/workflows/`. Content refresh and CI run
continuously; **shipping is release-gated** — deploys happen only when a release is cut.

- **Knowledge refresh** (`refresh.yml`): every Saturday 03:00 UTC, and on every push to `main` that changes `docs/` or
  `.opencrane/extensions.py`, OpenCrane reads the OSE docs from `docs/`, re-fetches the
  internal space's `llms-full.txt` from GitBook and its per-page `llms.txt` index (used for citation links),
  regenerates `chunks.json`, rebuilds the committed vector index (`embeddings.json` +
  `milvus.db`, via `scripts/knowledge/ensure-index.sh` — only when the chunks changed), and opens a
  pull request with any changes, as a `fix:` so release-please rolls the refreshed content into the release PR. Run it
  manually any time from the Actions tab; the manual run has a `force_reindex` checkbox that
  drops `embeddings.json` + `milvus.db` first so the index is rebuilt with the pinned
  opencrane even when the chunks are unchanged (use after an opencrane bump).
- **Knowledge CI** (`knowledge-ci.yml`): on every push/PR. It checks the plugin agent is in sync with
  `agent/ose-researcher.md`, checks the committed vector index is in sync with `chunks.json`
  (`scripts/knowledge/ensure-index.sh --check`), builds and tests the chat function in
  `functions/chat/`. It does not run the Python tests in `tests/knowledge/`. Its job is `validate`. The site's own checks run
  in `ci.yml`.
- **Chat function deploy** (`deploy-chat-function.yml`): builds and pushes the image of
  `functions/chat/` and updates the Scaleway container. It runs on a release and on
  `workflow_dispatch`. See [`deploy-chat.md`](deploy-chat.md). The chat page (`/ask/`) is part of the site,
  so `deploy-site.yml` ships it.
- **Release** (`release.yml`): you never cut a release by hand. Conventional commits on `main`
  (`fix:`→patch, `feat:`→minor, `feat!:`/`BREAKING CHANGE`→major) drive
  [release-please](https://github.com/googleapis/release-please), which maintains a rolling
  **release PR** that bumps the version, regenerates `CHANGELOG.md`, and syncs the
  `ose-knowledge-mcp` version everywhere (`plugin.json`, `.mcp.json`, the `/ask/` page, and
  the "Ask OSE from your AI tools" docs page, via `scripts/knowledge/sync-mcp-version.sh`, so the docs never promote a
  floating `latest`).
  `commitlint.yml` enforces the commit format. Needs the `RELEASE_TOKEN` secret so the release
  PR gets CI and the mcp-pin sync can push back onto it. **The release PR auto-merges**:
  `release.yml` arms GitHub native auto-merge on it, so once its CI (the required checks)
  is green it merges itself — no manual review. This needs "Allow auto-merge" on the repo and
  branch protection on `main` requiring the checks listed in
  [`../deployment.md`](../deployment.md). The required checks are what make auto-merge hold for
  green instead of merging instantly. Every change reaches `main` through a pull request, the
  weekly refresh included.

## Release = ship

Publish + deploy run in the *same* `release.yml` run — merging the release PR that cuts
`vX.Y.Z` (auto-merged once green, see above) triggers them via release-please's
`releases_created` output (no separate release-event workflow):

- **PyPI publish**: packs the **committed** vector index (`milvus.db` + `chunks.json`) into the
  `ose-knowledge-mcp` package (`opencrane pack` + `uv build`) and publishes it via PyPI trusted
  publishing — no re-embedding on release; that only happens when the chunks change (see
  [`knowledge-pipeline.md`](knowledge-pipeline.md)). The version comes from the release tag
  (`v0.2.0` → `0.2.0`).
- **Deploy**: builds + pushes the image and updates the Scaleway serverless container (see
  [`deploy-scaleway.md`](deploy-scaleway.md)); also runnable on its own via `workflow_dispatch`
  to redeploy an already-published version.
- **Chat function**: redeployed on every release to pick up persona and code changes.
- **Contact function and site**: deployed on every release. The site deploy waits for the PyPI
  publish, because `/ask/` shows the pinned package version. `workflow_dispatch` on
  `deploy-function.yml` and `deploy-site.yml` redeploys one part.

For the full contributor flow and the list of files release-please owns (never hand-edit), see
the Releases section of [`../../AGENTS.md`](../../AGENTS.md).
