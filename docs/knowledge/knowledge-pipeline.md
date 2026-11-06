# Knowledge pipeline (OpenCrane)

The knowledge base is built by an [OpenCrane](https://github.com/derberg/OpenCrane) pipeline
that fetches the OSE docs, chunks and
embeds them, and indexes them into Milvus Lite for the `search_docs` MCP tool.

## Sources

The index has two `llmstxt` sources:

- `open-source-europe`: the docs at `/docs/`, read from the Markdown in `src/content/docs/docs/`. `scripts/knowledge/docs-to-llms.py` exports the pages, in sidebar order, to `.opencrane/docs-export/open-source-europe/llms-full.txt` and a companion `llms.txt`, and `fetch` copies both into `.opencrane/llmstxt/open-source-europe/`. Answers cite `https://opensourceeurope.org/docs/...`. The export folder is not committed, so run the script before every `fetch`.
- `oc-europe-internal-doc`: the internal Open Collective Europe space, downloaded from https://docs.opencollective.com/oc-europe-internal-doc/llms-full.txt.

A change to a docs page reaches the chat with the next weekly refresh, which exports the docs again. To ship it sooner, run the pipeline below in the pull request and commit the results.

## Rebuild the index locally

opencrane is **version-locked** in [`.opencrane/opencrane-version`](../../.opencrane/opencrane-version)
(currently `0.35.0`) — CI and `scripts/knowledge/ensure-index.sh` invoke exactly that version via `uvx`,
never the latest PyPI release, so the index is reproducible. To move to a new opencrane, edit
that one file and regenerate the index (`./scripts/knowledge/ensure-index.sh`) in the same PR. Pin your
local commands to the same version so they match CI:

The pipeline steps (`fetch`, `chunk`, `build`) need opencrane's optional `[pipeline]`
extra — docling/PyGithub/tiktoken live there, kept out of the serve-only base so
`uvx ose-knowledge-mcp` stays slim. `embed`/`index`/`serve` run on the base install.

`fetch` needs a non-empty `GITHUB_TOKEN` even for llmstxt-only sources:

```bash
uv run --no-project --python 3.12 --with pyyaml==6.0.2 python scripts/knowledge/docs-to-llms.py
OC="opencrane[pipeline]@$(cat .opencrane/opencrane-version)"
GITHUB_TOKEN=x uvx -c .opencrane/constraints.txt "$OC" fetch
uvx -c .opencrane/constraints.txt "$OC" llms
uvx -c .opencrane/constraints.txt "$OC" chunk
uvx -c .opencrane/constraints.txt "$OC" embed
uvx -c .opencrane/constraints.txt "$OC" index
```

Or run the whole pipeline at once:

```bash
uv run --no-project --python 3.12 --with pyyaml==6.0.2 python scripts/knowledge/docs-to-llms.py
GITHUB_TOKEN=x uvx -c .opencrane/constraints.txt "opencrane[pipeline]@$(cat .opencrane/opencrane-version)" build
```

**Artifact strategy:** `chunks.json` + `llmstxt/` are committed build inputs, and
`embeddings.json` + `milvus.db` are committed build **artifacts** — the release packs the
committed `milvus.db` straight from the repo instead of re-embedding on every release. They
are regenerated **only when the chunks change**, not at Docker build time. Rather than running
`embed`/`index` by hand, use the wrapper, which re-embeds only if `chunks.json` actually
changed and is a no-op otherwise:

```bash
./scripts/knowledge/ensure-index.sh
```

If you change `chunks.json` (or chunking config), run it and commit
`.opencrane/embeddings.json` + `.opencrane/milvus.db` alongside — `knowledge-ci.yml` runs
`./scripts/knowledge/ensure-index.sh --check` and fails a PR whose committed index is stale vs its
chunks. The weekly `refresh.yml` does the same regeneration + commit automatically (see
[`automation.md`](automation.md)).

## Dependency caps

opencrane releases before 0.30.3 leave `transformers` unpinned, so a fresh install of one takes
the newest `transformers`.
[`.opencrane/constraints.txt`](../../.opencrane/constraints.txt) caps them in one place: `transformers<5.17`, because 5.17.0 removed `get_extended_attention_mask`, which the
`nomic-embed-text-v1.5` remote code calls, and every search then fails with
`'NomicBertModel' object has no attribute 'get_extended_attention_mask'`. The scripts and
workflows pass the file to `uvx --constraints`, the Dockerfile to `pip install -c`, and the
release copies each line into the published package's dependencies with
`scripts/knowledge/cap-pack-deps.sh`. `knowledge-ci.yml` fails when an opencrane install skips
it. To raise the cap, serve with `uvx --with 'transformers==<new version>'` in place of `-c`, run
`tests/knowledge/smoke_http.py`, and edit the file once the search returns sources. The pinned
opencrane 0.35.0 caps `transformers<5.17` itself too, so for now the file is a second guard.
It can go once a test shows it is redundant, together with the `knowledge-ci.yml` guard,
the cap step of `cap-pack-deps.sh`, the Dockerfile `-c` and the line in `AGENTS.md`. Packages
published before this change (0.5.2 and older) carry no cap in their metadata.

`cap-pack-deps.sh` also pins opencrane exactly. `opencrane pack` writes `opencrane>=<version>`,
so a published package would install whatever opencrane is newest, not the version that built
its bundled index. The script rewrites that to `opencrane==<.opencrane/opencrane-version>` and
fails if the result is not exactly that pin. Packages published before this change (0.5.2 and
older) still say `opencrane>=0.30.2`.

## Smoke-test the MCP search

```bash
MILVUS_DB_PATH=.opencrane/milvus.db uv run --with 'mcp<1.29' python tests/knowledge/smoke_query.py
```

Serve it locally over HTTP (port 8000):

```bash
MILVUS_DB_PATH=.opencrane/milvus.db uvx -c .opencrane/constraints.txt "opencrane@$(cat .opencrane/opencrane-version)" serve --transport http
```

## Build & test the MCP container

The MCP server is packaged as a container (built from `.opencrane/Dockerfile`) and serves MCP
Streamable HTTP on port 8000. Test the container locally:

```bash
docker build -f .opencrane/Dockerfile -t ose-mcp:local .
docker run -d --name ose-mcp -p 8000:8000 ose-mcp:local
uv run --with 'mcp<1.29' python tests/knowledge/smoke_http.py
docker rm -f ose-mcp
```

The public endpoint serves the `search_docs` tool (among others) over MCP Streamable HTTP at
`<endpoint>/http` (`<endpoint>/mcp` works too as a legacy alias). Deployment — Scaleway
one-time setup, required GitHub secrets/variables, and the deploy workflow — is in
[`deploy-scaleway.md`](deploy-scaleway.md).

## Published package

The knowledge base is also published to PyPI as a standalone MCP package (built with
`opencrane pack`, refreshed weekly), so it can run locally via `uvx ose-knowledge-mcp`. See the
repo [README](../../README.md#use-it-as-an-mcp-server--claude-plugin) for the client config, and
[`automation.md`](automation.md) for how the package is published on each release.
