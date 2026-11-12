# Knowledge pipeline (OpenCrane)

The knowledge base is built by an [OpenCrane](https://github.com/derberg/OpenCrane) pipeline
that fetches the OSE docs, chunks and
embeds them, and indexes them into Milvus Lite for the `search_docs` MCP tool.

## Sources

The index has two `llmstxt` sources:

- `open-source-europe`: the docs at `/docs/`, a local source that the `llms` step reads straight from `docs/`. `markdown_extensions` in `.opencrane/config.yaml` makes it read the `.mdx` home page too. `trailing_slash` makes page URLs end with `/` like the site's. The preprocessors in `.opencrane/extensions.py` turn Starlight asides, MDX imports and link cards into plain Markdown. `docsMarkdown` in `src/lib/llms.ts` applies the same rules for the site's `/llms-full.txt` and `/docs/<path>.md` files, so a new rule goes into both. Answers cite `https://opensourceeurope.org/docs/...`. `fetch` skips this source.
- `oc-europe-internal-doc`: the internal Open Collective Europe space, downloaded from https://docs.opencollective.com/oc-europe-internal-doc/llms-full.txt.

A docs change that merges to `main` starts the refresh workflow. The workflow exports the docs again, rebuilds the index and opens a pull request that merges itself. The chat answers from the change with the release that includes that pull request.

## Rebuild the index locally

OpenCrane is version-locked in [`.opencrane/opencrane-version`](../../.opencrane/opencrane-version)
(currently `0.36.0`). CI and `scripts/knowledge/ensure-index.sh` call exactly that version via `uvx`,
never the latest PyPI release, so the index is reproducible. To move to a new OpenCrane version, edit
that one file and regenerate the index (`./scripts/knowledge/ensure-index.sh`) in the same PR. Pin your
local commands to the same version so they match CI:

The pipeline steps (`fetch`, `chunk`, `build`) need OpenCrane's optional `[pipeline]`
extra. That extra holds docling, PyGithub and tiktoken. They are kept out of the serve-only base so
that `uvx ose-knowledge-mcp` stays small. `embed`/`index`/`serve` run on the base install.

`fetch` needs a non-empty `GITHUB_TOKEN` even for llmstxt-only sources:

```bash
OC="opencrane[pipeline]@$(cat .opencrane/opencrane-version)"
GITHUB_TOKEN=x uvx -c .opencrane/constraints.txt "$OC" fetch
uvx -c .opencrane/constraints.txt "$OC" llms
uvx -c .opencrane/constraints.txt "$OC" chunk
uvx -c .opencrane/constraints.txt "$OC" embed
uvx -c .opencrane/constraints.txt "$OC" index
```

Or run the whole pipeline at once:

```bash
GITHUB_TOKEN=x uvx -c .opencrane/constraints.txt "opencrane[pipeline]@$(cat .opencrane/opencrane-version)" build
```

`chunks.json` + `llmstxt/` are committed build inputs, and
`embeddings.json` + `milvus.db` are committed build artifacts. The release packs the
committed `milvus.db` straight from the repo instead of re-embedding on every release. These two files
are regenerated only when the chunks change, not at Docker build time. Instead of running
`embed`/`index` by hand, use the wrapper. It re-embeds only if `chunks.json` changed, and
does nothing otherwise:

```bash
./scripts/knowledge/ensure-index.sh
```

If you change `chunks.json` (or the chunking config), run it and commit
`.opencrane/embeddings.json` + `.opencrane/milvus.db` with the change. `knowledge-ci.yml` runs
`./scripts/knowledge/ensure-index.sh --check` and fails a PR whose committed index is older than its
chunks. The weekly `refresh.yml` does the same regeneration and commit automatically (see
[`automation.md`](automation.md)).

## Dependency caps

OpenCrane releases before 0.30.3 leave `transformers` unpinned, so a fresh install of one takes
the newest `transformers`.
[`.opencrane/constraints.txt`](../../.opencrane/constraints.txt) caps them in one place: `transformers<5.17`. Version 5.17.0 removed `get_extended_attention_mask`, which the
`nomic-embed-text-v1.5` remote code calls. Every search then fails with
`'NomicBertModel' object has no attribute 'get_extended_attention_mask'`. The scripts and
workflows pass the file to `uvx --constraints`, and the Dockerfile passes it to `pip install -c`. The
release copies each line into the published package's dependencies with
`scripts/knowledge/cap-pack-deps.sh`. `knowledge-ci.yml` fails when an OpenCrane install skips
it. To raise the cap, serve with `uvx --with 'transformers==<new version>'` in place of `-c`, run
`tests/knowledge/smoke_http.py`, and edit the file once the search returns sources. The pinned
OpenCrane 0.36.0 caps `transformers<5.17` itself too, so for now the file is a second guard.
It can go once a test shows it is redundant, together with the `knowledge-ci.yml` guard,
the cap step of `cap-pack-deps.sh`, the Dockerfile `-c` and the line in `AGENTS.md`. Packages
published before this change (0.5.2 and older) carry no cap in their metadata.

`cap-pack-deps.sh` also pins OpenCrane exactly. `opencrane pack` writes `opencrane>=<version>`,
so a published package would install whatever OpenCrane version is newest, not the version that built
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
`<endpoint>/http` (`<endpoint>/mcp` works too as a legacy alias). [`deploy-scaleway.md`](deploy-scaleway.md)
covers deployment: the Scaleway one-time setup, the required GitHub secrets and variables, and the
deploy workflow.

## Published package

The knowledge base is also published to PyPI as a standalone MCP package (built with
`opencrane pack`, refreshed weekly), so it can run locally via `uvx ose-knowledge-mcp`. See the
docs page [Ask OSE from your AI tools](https://opensourceeurope.org/docs/guides/ask-ose-from-your-ai-tools/) for the client config, and
[`automation.md`](automation.md) for how the package is published on each release.
