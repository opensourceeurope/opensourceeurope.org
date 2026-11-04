# Deploying the chat

The public chat is two decoupled pieces, both EU-hosted:

- **`functions/chat/`**: a stateless Node 22 / TypeScript serverless container. It holds the
  inference API key, runs the agentic loop (`mistral-small-3.2-24b-instruct-2506`
  tool-calling on Scaleway Generative APIs -> the OSE MCP `search_docs` -> a final cited
  answer), and returns JSON `{ answer, citations }`. Entry point is `dist/server.js`,
  which listens on `$PORT`.
- **The chat UI on the site**: the `/ask/` page and the slide-out Ask panel on every other page.
  They are part of the Astro site (`src/components/chat/`, `src/scripts/chat/`), with self-hosted
  Manrope. The UI POSTs `{ messages, analyticsOptIn }` to the function and renders the answer plus
  citation chips. The site build reads the function URL from the `CHAT_FUNCTION_URL` repository
  variable and bakes it in as `PUBLIC_CHAT_ENDPOINT`. The texts are in `src/content/pages/ask.yaml`
  and under `chat` in `src/content/settings/site.yaml`.

This doc mirrors the style of [`deploy-scaleway.md`](deploy-scaleway.md) (the MCP server
deploy) and reuses the same `scw` conventions. Everything runs on **Scaleway**.

## Sovereignty

The entire request path runs on European infrastructure:

- **Inference** — Scaleway Generative APIs (EU), `mistral-small-3.2-24b-instruct-2506`
  (Mistral Small, Apache 2.0, built in France).
- **Function + site**: Scaleway (EU).
- **MCP** — the OSE MCP server on Scaleway (EU), per [`deploy-scaleway.md`](deploy-scaleway.md).

Self-hosted Manrope woff2 (no third-party font CDN) keeps every byte of the page
served from European infrastructure too.

## Access control & cost posture

The function holds the inference API key server-side (it is never sent to the browser or
embedded in the static page), but every accepted request spends Scaleway credits, so
who may call it matters:

- **`ALLOWED_ORIGINS` is enforced server-side.** With it set (always do this in prod),
  the function returns `403` for any request whose `Origin` header is missing or not an
  exact allowlist match — this is a real rejection, not just a CORS header. It blocks
  all browser-based cross-site abuse and casual scripted calls.
- **Honest limitation:** the `Origin` header can be forged by a non-browser client, so
  a determined attacker can still call the endpoint directly. The hard backstop is
  platform-level: Scaleway free-tier/account limits bound total spend, and you can add
  rate-limiting in front of the function (gateway/CDN/WAF) if abuse appears.

There is **no custom rate-limiting** in the function itself. The spend controls you have:

- **`MAX_TOOL_ROUNDS`** (default `4`) caps how many tool-call rounds a single request can
  run, bounding the inference calls per question. Lower it to tighten the ceiling.
- **`MISTRAL_MODEL`** — keep the small model (`mistral-small-3.2-24b-instruct-2506`)
  rather than switching to a larger, pricier one on Scaleway, to reduce per-call cost.
- **Request bodies are capped at 128 KiB** and chat history is trimmed to the last 12
  turns, bounding per-request token volume.

For the measured token/€ cost per question and per session, see
[`chat-cost.md`](chat-cost.md) (short version: ~€1.60 per 1,000 sessions).

If you later need hard limits, add rate-limiting in front of the function (e.g. at the
gateway/CDN) rather than in this code.

## Environment variables (function)

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `MISTRAL_API_KEY` | yes | — | Inference API key (your Scaleway key for the hosted deployment); store as a **secret**, never as a plain env value. |
| `MISTRAL_MODEL` | no | `mistral-small-latest` | Model id. Set to `mistral-small-3.2-24b-instruct-2506` for Scaleway. Spend control (see above). |
| `MISTRAL_BASE_URL` | no | — | OpenAI-compatible endpoint. `https://api.scaleway.ai` for Scaleway Generative APIs (EU); a local Ollama URL for offline; unset = Mistral's own API. The SDK appends `/v1/chat/completions`, so do **not** include `/v1`. |
| `OSE_MCP_URL` | yes | — | Deployed MCP endpoint, e.g. `https://<endpoint>/mcp`. |
| `ALLOWED_ORIGINS` | no | `*` | **Enforced server-side** (403 when Origin is missing/not listed). Set to the **site origins** in prod, e.g. `https://opensourceeurope.org`. Comma-separated for multiple. `*` disables the check — never leave it in prod. In the automated deploy this is built for you: the `CHAT_S3_BUCKET` bucket website URL plus the `CHAT_EXTRA_ORIGINS` repo variable (see below). `/ask/` and the panel get a 403 until `CHAT_EXTRA_ORIGINS` holds the site origins. |
| `MAX_TOOL_ROUNDS` | no | `4` | Spend control (see above). |
| `PORT` | no | `8080` | Injected by the platform on Scaleway/containers. |

Build once before deploying: `cd functions/chat && npm run build` (runs `build:persona`,
then `tsc`, emitting `dist/`).

## Deploy the function

You have a Scaleway CLI configured (`scw init`, or `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` /
`SCW_DEFAULT_PROJECT_ID` exported). Pick a region and reuse it:

```sh
export SCW_DEFAULT_REGION=pl-waw
```

### Option A — Scaleway Serverless Function (Node 22)

Cheapest and simplest: no image to build. Package the built function and its runtime
dependencies, then create a function with the Node 22 runtime, handler `dist/server.js`,
and the env vars above. `MISTRAL_API_KEY` must be a secret.

```sh
# Build, then zip dist/ + node_modules (production deps only) + package.json.
cd functions/chat
npm ci --omit=dev
npm run build
zip -r ../ose-chat-function.zip dist node_modules package.json

# Create a Serverless Functions namespace to hold the function.
scw function namespace create name=ose-chat

# Create the function (capture the returned ID; replace <namespace-id> from the step above).
scw function function create \
  namespace-id=<namespace-id> \
  name=ose-chat \
  runtime=node22 \
  handler=dist/server.js \
  min-scale=0 \
  max-scale=2 \
  memory-limit=256

# Upload the package and deploy it.
scw function function deploy <function-id> zip-file=../ose-chat-function.zip

# Set env vars and the secret (replace <function-id>).
scw function function update <function-id> \
  environment-variables.MISTRAL_BASE_URL=https://api.scaleway.ai \
  environment-variables.MISTRAL_MODEL=mistral-small-3.2-24b-instruct-2506 \
  environment-variables.OSE_MCP_URL=https://<mcp-endpoint>/mcp \
  environment-variables.ALLOWED_ORIGINS=https://opensourceeurope.org \
  environment-variables.MAX_TOOL_ROUNDS=4 \
  secret-environment-variables.0.key=MISTRAL_API_KEY \
  secret-environment-variables.0.value=<your-scaleway-key>
```

> Flag names can drift between `scw` versions; run `scw function function create --help`
> and `scw function function deploy --help` to confirm the exact spelling for your CLI.
> The Node 22 entry is `dist/server.js`; the platform injects `$PORT`, which the server
> already honours.

The function URL is shown by `scw function function get <function-id>`. That URL is the
`CHAT_FUNCTION_URL` the site build needs.

### Option B — Scaleway Serverless Container

This is the option the release workflow uses. `functions/chat/Dockerfile` has a Node 22 base
and `CMD ["node", "dist/server.js"]`. The flow matches the MCP container in
[`deploy-scaleway.md`](deploy-scaleway.md): build the image, push it to the Scaleway
Container Registry, and create a container with `port=8080` and the same env vars/secret.

```sh
scw container namespace create name=ose-chat
scw container container create \
  namespace-id=<namespace-id> \
  name=ose-chat \
  port=8080 \
  min-scale=0 \
  max-scale=2 \
  memory-limit=256 \
  registry-image=rg.pl-waw.scw.cloud/<namespace>/ose-chat:latest
```

Set env vars/secret with `scw container container update <container-id> ...` using the
same keys as Option A.

### Streaming through Scaleway

The site asks the function for Server-Sent Events (`Accept: text/event-stream`, protocol in
[`functions/chat/README.md`](../../functions/chat/README.md), "Streaming"). The function sends
`Cache-Control: no-cache` and `X-Accel-Buffering: no` and a `: keep-alive` comment every 10 s.

Whether Scaleway Serverless Containers pass the stream through without buffering is **not
confirmed**. Scaleway's documentation says a container must handle "HTTP, HTTP/2, WebSockets, or
gRPC" and allows a request timeout of 10 seconds to 60 minutes, but it says nothing about
Server-Sent Events or response buffering
([containers limitations](https://www.scaleway.com/en/docs/serverless-containers/reference-content/containers-limitations/),
[FAQ](https://www.scaleway.com/en/docs/serverless-containers/faq/)). Check it on the first deploy
(see "Verify" below). If the gateway buffers, the chat still works: the browser gets the whole
stream at the end and reads the `done` event, so the visitor sees the status line until the
answer appears, as with the JSON response. A browser or client that does not ask for a stream
gets the JSON response.

## The chat page

The chat page is part of the site, so there is no separate page deploy. `deploy-site.yml`
builds the site with `PUBLIC_CHAT_ENDPOINT` set from `CHAT_FUNCTION_URL` and syncs it to the
site bucket (see [`../deployment.md`](../deployment.md)). The function's `ALLOWED_ORIGINS` must
include every origin that serves the site: `https://opensourceeurope.org`, and `https://www.opensourceeurope.org` while the site is also served there. Put them in `CHAT_EXTRA_ORIGINS`. The "Use it in your own tools or locally" blocks on
`/ask/` are static. They advertise the PyPI-published `ose-knowledge-mcp` package, not this
deployment's endpoint.

## Automated function deploy (GitHub Actions → Scaleway container)

[`deploy-chat-function.yml`](../../.github/workflows/deploy-chat-function.yml) builds
`functions/chat/`, pushes the image to the Scaleway registry, and updates the container. It runs
in every release, called from `release.yml`, and on its own from **Actions → Deploy chat function
to Scaleway → Run workflow**. It reuses the Scaleway credentials of the MCP deploy.

### Repository configuration

Variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Description | Value |
| --- | --- | --- |
| `CHAT_FUNCTION_URL` | Public URL of the chat function. `deploy-site.yml` reads it as `PUBLIC_CHAT_ENDPOINT`. | set after the container exists |
| `SCW_FUNCTION_CONTAINER_ID` | ID of the function's container. | from the console |
| `OSE_MCP_URL` | Hosted MCP endpoint. | `https://<mcp-endpoint>/mcp` |
| `CHAT_S3_BUCKET` | Bucket whose website URL joins `ALLOWED_ORIGINS`. | an existing bucket name |
| `SCW_REGION` | Region. | `pl-waw` |
| `CHAT_EXTRA_ORIGINS` | Origins appended to the function's `ALLOWED_ORIGINS` on top of the bucket website URL. Comma-separated, no trailing slash. | `https://opensourceeurope.org,https://www.opensourceeurope.org` |
| `CHAT_SEARCH_FIRST` | Optional. `false` turns off the automatic first search, so the model decides alone whether to search. Unset keeps it on. | `false` |

Secrets: `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`
and `MISTRAL_API_KEY`. This workflow has no GitHub environment, so these stay at repository level.

The workflow sets `ALLOWED_ORIGINS` on each deploy: the bucket website URL plus anything in
`CHAT_EXTRA_ORIGINS`. Because Scaleway replaces the runtime env wholesale per deploy, the site
origins **must** live in `CHAT_EXTRA_ORIGINS`. A value added by hand on the container is wiped on
the next redeploy. While the site is also served from `https://www.opensourceeurope.org` or the
Edge Services host, add those origins too.

The workflow fails fast with a clear message if a required value is missing.

## Verify

1. Open `/ask/` on the site; confirm fonts load from the site (no Google Fonts requests).
2. Ask a question. The browser POSTs to `FUNCTION_URL`; you should get an answer with
   citation chips. If you see a CORS error or a `403 {"error":"origin_not_allowed"}`,
   fix `CHAT_EXTRA_ORIGINS` and redeploy the function. It must list the exact site origin
   (scheme + host + port).
3. Confirm the answer streams without buffering. Run
   `curl -N -H 'Accept: text/event-stream' -H 'content-type: application/json' -H 'Origin: https://opensourceeurope.org' -d '{"messages":[{"role":"user","content":"What is fiscal hosting?"}]}' <FUNCTION_URL>`.
   The `event: status` lines must appear seconds before the `event: done` line, not all at
   once at the end. In the browser, the status line under the question changes from
   "Searching the docs" to "Writing the answer" and the text appears piece by piece. If
   everything arrives at once, the platform buffers: the chat still works, so note it in
   `docs/deployment.md` under "Known weaknesses".
4. Confirm enforcement works: `curl -X POST <FUNCTION_URL> -H 'content-type:
   application/json' -d '{"messages":[{"role":"user","content":"hi"}]}'` (no Origin
   header) must return `403`. If it returns an answer, `ALLOWED_ORIGINS` is still `*`.
5. Sharing is **off by default**. The site sends `analyticsOptIn: true` only when the visitor accepted analytics in the consent banner (there is no checkbox in the chat). Then the function logs one
   anonymous line (`ANALYTICS {...}` — query text, round count, whether the docs answered it and the prompt version, no IP/PII) to stdout,
   which lands in Scaleway Cockpit (EU). The export job in `analytics/` keeps it in a private
   bucket.
