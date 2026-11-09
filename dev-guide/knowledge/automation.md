# Automation

All CI, release and deploy automation is in `.github/workflows/`. Content refresh and CI run
continuously. Shipping is release-gated: deploys happen only when a release is cut.

- Knowledge refresh (`refresh.yml`): runs every Saturday 03:00 UTC, and on every push to `main` that changes `docs/` or
  `.opencrane/extensions.py`. OpenCrane reads the OSE docs from `docs/`. It re-fetches the
  internal space's `llms-full.txt` from GitBook and its per-page `llms.txt` index (used for citation links),
  and regenerates `chunks.json`. Only when the chunks changed, it rebuilds the committed vector index
  (`embeddings.json` + `milvus.db`) via `scripts/knowledge/ensure-index.sh`. The workflow then opens a
  pull request with any changes, as a `fix:`, so release-please rolls the refreshed content into the release PR. You
  can run it manually any time from the Actions tab. The manual run has a `force_reindex` checkbox. It
  drops `embeddings.json` + `milvus.db` first, so the index is rebuilt with the pinned
  OpenCrane version even when the chunks are unchanged. Use it after an OpenCrane bump.
- Knowledge CI (`knowledge-ci.yml`): runs on every push and PR. It checks that the plugin agent is in sync with
  `agent/ose-researcher.md`, and that the committed vector index is in sync with `chunks.json`
  (`scripts/knowledge/ensure-index.sh --check`). It also builds and tests the chat function in
  `functions/chat/`. It does not run the Python tests in `tests/knowledge/`. Its job is `validate`. The site's own checks run
  in `ci.yml`.
- Chat function deploy (`deploy-chat-function.yml`): builds and pushes the image of
  `functions/chat/` and updates the Scaleway container. It runs on a release and on
  `workflow_dispatch`. See [`deploy-chat.md`](deploy-chat.md). The chat page (`/ask/`) is part of the site,
  so `deploy-site.yml` ships it.
- Release (`release.yml`): you never cut a release by hand. Conventional commits on `main`
  (`fix:`→patch, `feat:`→minor, `feat!:`/`BREAKING CHANGE`→major) drive
  [release-please](https://github.com/googleapis/release-please). It maintains a rolling
  release PR. That PR bumps the version, regenerates `CHANGELOG.md`, and syncs the
  `ose-knowledge-mcp` version everywhere: `plugin.json`, `.mcp.json`, the `/ask/` page, and
  the "Ask OSE from your AI tools" docs page. `scripts/knowledge/sync-mcp-version.sh` does the sync, so the docs never promote a
  floating `latest`.
  `commitlint.yml` enforces the commit format. `release.yml` needs the `RELEASE_TOKEN` secret so the release
  PR gets CI and the mcp-pin sync can push back onto it. The release PR merges itself:
  `release.yml` turns on GitHub native auto-merge for it, so the PR merges as soon as its CI
  (the required checks) is green, with no manual review. This needs "Allow auto-merge" on the repo and
  branch protection on `main` requiring the checks listed in
  [`../deployment.md`](../deployment.md). The required checks make auto-merge wait for
  green instead of merging at once. Every change reaches `main` through a pull request, the
  weekly refresh included.

## Release = ship

Publish and deploy run in the *same* `release.yml` run. Merging the release PR that cuts
`vX.Y.Z` (auto-merged once green, see above) starts them via release-please's
`releases_created` output. There is no separate release-event workflow. The run does the following:

- PyPI publish: packs the committed vector index (`milvus.db` + `chunks.json`) into the
  `ose-knowledge-mcp` package (`opencrane pack` + `uv build`) and publishes it via PyPI trusted
  publishing. A release does no re-embedding. That happens only when the chunks change (see
  [`knowledge-pipeline.md`](knowledge-pipeline.md)). The version comes from the release tag
  (`v0.2.0` → `0.2.0`).
- Deploy: builds and pushes the image and updates the Scaleway Serverless Container (see
  [`deploy-scaleway.md`](deploy-scaleway.md)). You can also run it on its own via `workflow_dispatch`
  to redeploy an already-published version.
- Chat function: redeployed on every release to pick up persona and code changes.
- Contact function and site: deployed on every release. The site deploy waits for the PyPI
  publish, because `/ask/` shows the pinned package version. `workflow_dispatch` on
  `deploy-function.yml` and `deploy-site.yml` redeploys one part.

For the full contributor flow and the list of files release-please owns (never hand-edit), see
the Releases section of [`../../AGENTS.md`](../../AGENTS.md).
