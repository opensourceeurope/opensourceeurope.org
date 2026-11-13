# Deployment

The site is static files in a Scaleway Object Storage bucket, served through Scaleway Edge Services. The contact form posts to a Scaleway Serverless Function that sends the message by email through Proton Mail SMTP. The chat on `/ask/` and in the Ask panel calls the chat function, a Scaleway Serverless Container. The repository also ships the `ose-knowledge-mcp` package on PyPI and a hosted MCP container. One release deploys all of them. These workflows do the work:

- `.github/workflows/release.yml` runs release-please. On a release it publishes the package to PyPI (`publish`), deploys the MCP container (`deploy`), and calls the three workflows below.
- `.github/workflows/deploy-site.yml` builds the site and syncs `dist/` to the bucket.
- `.github/workflows/deploy-function.yml` builds `functions/contact/contact.zip` and deploys it.
- `.github/workflows/deploy-chat-function.yml` builds `functions/chat/` as an image and rolls out the chat function container.
- `.github/workflows/deploy-analytics-job.yml` deploys the chat analytics export job. It still runs on its own, on a push to `main` that changes `analytics/**`, and on demand.

A push to `main` no longer deploys the site or the functions. See "Release" below.

This page lists what to set up first, how the first release goes, and the cutover from the old chat address and the old repository.

## Repository variables and secrets

Set these under Settings, Secrets and variables, Actions. The deploy workflows stop with an `::error::` message when a value they need is empty.

| Name | Kind | Used by | Value |
|---|---|---|---|
| `SCW_ACCESS_KEY` | secret | all Scaleway workflows: `deploy-site.yml`, `deploy-function.yml`, `deploy-chat-function.yml`, `deploy-analytics-job.yml`, `release.yml` | Access key of the deploy API key |
| `SCW_SECRET_KEY` | secret | same workflows as `SCW_ACCESS_KEY` | Secret key of the deploy API key |
| `SCW_REGION` | variable | same workflows as `SCW_ACCESS_KEY` | `pl-waw` |
| `SITE_S3_BUCKET` | variable | `deploy-site.yml` | Bucket name. `opensourceeurope-site` (see "Bucket") |
| `CONTACT_ENDPOINT` | variable | `deploy-site.yml` | Public URL of the function. The site build reads it as `PUBLIC_CONTACT_ENDPOINT`. The other builds use a local value |
| `SCW_FUNCTION_ID` | variable | `deploy-function.yml` | UUID of the function. It is shown in the console and by `scw function function list` |
| `CHAT_FUNCTION_URL` | variable | `deploy-site.yml` | Public URL of the chat function. The site build reads it as `PUBLIC_CHAT_ENDPOINT` for `/ask/` and the panel. The site deploy stops when it is empty |

The chat function and the MCP container have their own variables and secrets: `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID`, `MISTRAL_API_KEY`, `SCW_REGISTRY_NAMESPACE`, `SCW_CONTAINER_ID`, `SCW_FUNCTION_CONTAINER_ID`, `OSE_MCP_URL`, `CHAT_S3_BUCKET`, `CHAT_EXTRA_ORIGINS`, `MISTRAL_MODEL`, `MISTRAL_BASE_URL` and the optional `CHAT_SEARCH_FIRST`. [`dev-guide/knowledge/deploy-chat.md`](knowledge/deploy-chat.md) and [`dev-guide/knowledge/deploy-scaleway.md`](knowledge/deploy-scaleway.md) describe them. `release.yml` also needs the `RELEASE_TOKEN` secret.

### Keep the Scaleway values at repository level

`deploy-site.yml` and `deploy-function.yml` run under the GitHub environment `production`. The `publish` and `deploy` jobs in `release.yml` and `deploy-chat-function.yml` have no environment. A job without an environment sees only repository-level secrets and variables. If you move the Scaleway secrets and variables into the `production` environment, those jobs get empty credentials and fail.

So keep `SCW_ACCESS_KEY`, `SCW_SECRET_KEY` and the other Scaleway values at repository level. A job under `production` reads them from there too. The environment may carry its own copies, and a copy in the environment wins for the jobs that use it. Keep both copies equal.

## One-time setup, before the first push

The first push to `main` starts a release, so do these steps first, in this order. None of them needs a change in the old repository, `opensourceeurope/ose-knowledge-mcp`, which stays as it is.

1. Create the public repository `opensourceeurope/opensourceeurope.org`. Leave it empty: no README, no licence, no `.gitignore`.
2. Add every repository secret and variable from the table below. Nothing carries over from the old repository, so copy the values from there and from the Scaleway sections of this page. `RELEASE_TOKEN` is a new fine-grained personal access token. Scope it to the new repository only, with write access to contents and to pull requests. Do not reuse the old token.
3. On pypi.org, add a trusted publisher for `ose-knowledge-mcp` with the repository `opensourceeurope/opensourceeurope.org` and the workflow `release.yml`. It has no environment. Keep the old publisher until the old repository is archived (see "Cutover"). If the new publisher is missing, the first publish fails.
4. Set the variable `CHAT_EXTRA_ORIGINS` to `https://opensourceeurope.org,https://www.opensourceeurope.org`. `deploy-chat-function.yml` builds `ALLOWED_ORIGINS` from the `CHAT_S3_BUCKET` website URL plus this variable, and the function answers 403 to any other origin. Without `https://opensourceeurope.org` in it, `/ask/` and the panel fail. Keep `https://www.opensourceeurope.org` while the site is served there. If the site is also served from the Edge Services host before launch, add that origin too. Check that `CHAT_FUNCTION_URL` holds the public URL of the chat function. Set `MISTRAL_BASE_URL` to `https://api.scaleway.ai`, because with the variable unset the questions go to Mistral's own API, and the privacy policy would be false. Also set the contact function settings from "One-time Scaleway setup" below.
5. In the settings of the new repository, leave "Allow auto-merge" off until the first release has been checked. If the old repository allowed only squash merges, allow only squash merges here too. `release.yml` and `refresh.yml` merge with `--squash`, and release-please needs the squash commit to cut the tag.
6. Check `.release-please-manifest.json` on `fresh-start`. It holds the version that release-please starts from. The new repository has no tags, so the manifest is the only starting point.
7. Push from the local clone, as a normal push to an empty repository:

   ```bash
   git push <new-repo-url> fresh-start:main
   ```

   There is no force-push and no protection to lift. Then add branch protection on `main` with the checks under "Required checks".

### Secrets and variables

These are all the `secrets.*` and `vars.*` the workflows in `.github/workflows/` read. Set all of them at repository level (see "Keep the Scaleway values at repository level").

| Name | Kind | Needed by |
|---|---|---|
| `SCW_ACCESS_KEY` | secret | `deploy-site.yml`, `deploy-function.yml`, `deploy-chat-function.yml`, `deploy-analytics-job.yml`, `release.yml` |
| `SCW_SECRET_KEY` | secret | same as `SCW_ACCESS_KEY` |
| `SCW_DEFAULT_PROJECT_ID` | secret | `deploy-function.yml`, `deploy-chat-function.yml`, `deploy-analytics-job.yml`, `release.yml` |
| `SCW_DEFAULT_ORGANIZATION_ID` | secret | `deploy-function.yml`, `deploy-chat-function.yml`, `deploy-analytics-job.yml`, `release.yml` |
| `MISTRAL_API_KEY` | secret | `deploy-chat-function.yml`, `release.yml` |
| `RELEASE_TOKEN` | secret | `release.yml`, `refresh.yml` |
| `SCW_REGION` | variable | `deploy-site.yml`, `deploy-function.yml`, `deploy-chat-function.yml`, `deploy-analytics-job.yml`, `release.yml` |
| `SCW_REGISTRY_NAMESPACE` | variable | `deploy-chat-function.yml`, `deploy-analytics-job.yml`, `release.yml` |
| `SCW_CONTAINER_ID` | variable | `release.yml` (the MCP container) |
| `SCW_FUNCTION_CONTAINER_ID` | variable | `deploy-chat-function.yml` |
| `SCW_FUNCTION_ID` | variable | `deploy-function.yml` |
| `SITE_S3_BUCKET` | variable | `deploy-site.yml` |
| `CONTACT_ENDPOINT` | variable | `deploy-site.yml` |
| `CHAT_FUNCTION_URL` | variable | `deploy-site.yml` |
| `CHAT_S3_BUCKET` | variable | `deploy-chat-function.yml` |
| `CHAT_EXTRA_ORIGINS` | variable | `deploy-chat-function.yml` |
| `CHAT_SEARCH_FIRST` | variable, optional | `deploy-chat-function.yml` |
| `OSE_MCP_URL` | variable | `deploy-chat-function.yml` |
| `MISTRAL_MODEL` | variable | `deploy-chat-function.yml` |
| `MISTRAL_BASE_URL` | variable | `deploy-chat-function.yml` |
| `ANALYTICS_BUCKET` | variable | `deploy-analytics-job.yml` |
| `OSE_ANALYTICS_LOKI_URL` | variable | `deploy-analytics-job.yml` |
| `ANALYTICS_EXPORT_ACCESS_KEY` | variable | `deploy-analytics-job.yml` |
| `OSE_EDGE_LOKI_URL` | variable, optional | `deploy-analytics-job.yml` |

`ANALYTICS_EXPORT_ACCESS_KEY` holds the access key ID of the IAM application `ose-analytics-export`, not a secret key. `deploy-analytics-job.yml` reads it only when it creates the job definition. `OSE_EDGE_LOKI_URL` holds the Loki URL of the `fr-par` Cockpit logs data source, which holds the Edge Services logs. Without it, a new job definition skips the page-view counts. The job's secret key and Cockpit tokens stay in Scaleway Secret Manager. See [`analytics/README.md`](../analytics/README.md).

`CHAT_FUNCTION_URL` is used by `deploy-site.yml`, and `CHAT_S3_BUCKET` by `deploy-chat-function.yml`. `SITE_S3_BUCKET` and `CHAT_S3_BUCKET` hold the same bucket name, `opensourceeurope-site`. `GITHUB_TOKEN` is provided by GitHub and needs no setup.

## Fresh start

The new repository starts with one commit and no other history.

1. A maintainer reviews the `fresh-start` branch locally, or from a fork or a temporary branch. The branch has one commit with the site files and the knowledge files. CI and the quality gates must pass on that tree.
2. A maintainer completes "One-time setup, before the first push" and pushes `fresh-start` to the new repository as `main`.
3. The old repository keeps its history, tags and releases. Nothing is deleted there. It is archived later (see "Cutover").

The commit is authored by the maintainer and has no agent trailer. Every later change goes through pull requests.

## First release

The push to `main` starts `release.yml`. release-please opens a release pull request, with the version from `.release-please-manifest.json`.

1. Check its version and its changelog. The version is the one in the manifest plus the bump for the commits.
2. Merge it by hand. "Allow auto-merge" is still off, so the run that the push started shows a failed "Enable auto-merge on the release PR" step. That failure is expected, and the release pull request itself is fine.
3. Watch the `release` run. Check each part:
   - the `ose-knowledge-mcp` package on PyPI, at the new version;
   - the hosted MCP server, with a `search_docs` call. Then check the MCP container's logs in Scaleway Cockpit: there must be no `🔍 Search:` lines. The image sets `LOG_LEVEL=WARNING` so that search queries, which can be a visitor's question word for word, are not logged. If such lines appear, check that no `LOG_LEVEL` environment variable on the container overrides it;
   - the chat function, with a question on `/ask/`. The answer must cite at least one source. Then check the function's logs in Scaleway Cockpit for a `tool_choice_fallback` line. That line means the endpoint rejected a `tool_choice` value and the function fell back. The chat still works then, but tell the maintainers, because the forced search and the forced final answer are weaker. The values were only tested against a local model before launch. If every question fails with the generic error, the endpoint probably rejects the forced search in a way the fallback does not catch: set the repository variable `CHAT_SEARCH_FIRST=false` and redeploy the chat function (run `deploy-chat-function.yml`);
   - the chat answer streams: the status line changes and the text appears piece by piece, and the `curl -N` check in step 3 of "Verify" in [`knowledge/deploy-chat.md`](knowledge/deploy-chat.md) shows the `status` events before `done`. Scaleway does not document whether it buffers Server-Sent Events, so this is the first real check;
   - the site, on `https://www.opensourceeurope.org`, including the Ask panel on another page;
   - the contact form. Send one real message from `/contact/` and confirm that it lands in the `home@opensourceeurope.org` inbox (not in spam), from `home@opensourceeurope.org`, with the address you entered as Reply-To. If the form shows an error, check the function's logs in Scaleway Cockpit. A timeout on port 587 means Scaleway blocks it. See the fallback at the end of "Proton SMTP token".
4. Turn "Allow auto-merge" on in the repository settings.
5. Stop the old repository. Right after the first release, turn off GitHub Actions in `opensourceeurope/ose-knowledge-mcp`: Settings, Actions, General, Disable actions. Its weekly `refresh.yml` and its self-merging `release.yml` would otherwise keep redeploying the hosted MCP container and the chat function from the old code.

## Required checks

Add branch protection on `main` after the first push. It requires these checks:

- `ci` (type check, unit tests, licences and the co-author check)
- `e2e` (Playwright and the accessibility scan, the second job of `ci.yml`)
- `validate` (the job of `knowledge-ci.yml`)
- `commitlint`
- `lighthouse` (the gate job of `lighthouse.yml`; it passes without auditing when a pull request changes no file the pages depend on)
- `links`
- the pull request body check (`check`, from `check-pr-body.yml`)

Do not require `lint-workflows` or `security-audit`. `lint-workflows` runs only when a change touches `.github/`, so a required check would block every other pull request. Leave `security-audit` out too. It checks dependencies against a changing advisory database, so a new advisory could block unrelated pull requests.

## Release

A release deploys everything. Merging the release pull request makes release-please tag `vX.Y.Z`, and the same `release.yml` run then starts these jobs:

| Job | Waits for | Does |
|---|---|---|
| `publish` | release-please | Publishes the package to PyPI |
| `deploy` | `publish` | Deploys the MCP container |
| `deploy-function` | release-please | Deploys the chat function |
| `deploy-contact-function` | release-please | Deploys the contact form function |
| `deploy-site` | `publish` | Builds and deploys the site |

The site deploy waits for the PyPI publish, because `/ask/` shows the pinned package version and must not show one that PyPI lacks. A site deploy does not purge Edge Services, so purge the pipeline cache after it (see "Edge Services").

`workflow_dispatch` on each deploy workflow redeploys one part: `deploy-site.yml`, `deploy-function.yml` and `deploy-chat-function.yml`. `release.yml` takes the version of an already-published package and redeploys the MCP container and the chat function. A run from a branch other than `main` does not deploy the site or the contact function. `deploy-analytics-job.yml` is separate. It deploys on a push to `main` that changes `analytics/**`.

## Cutover

The cutover starts after the site is live from the new repository. Do these steps in order:

1. Check the PyPI package, the hosted MCP server and the chat function after the first release. This was already done under "First release".
2. Check that `/ask/` and the panel answer questions on www.opensourceeurope.org.
3. Open the pull request to `opensourceeurope/ose-ai` that changes the `ose-knowledge` plugin `url` to `opensourceeurope/opensourceeurope.org`.
4. Once that pull request is merged, remove the old trusted publisher of `ose-knowledge-mcp` on pypi.org. Then archive `opensourceeurope/ose-knowledge-mcp`, after you add a note to its README that points to the new repository.


The deploy API key needs write access to Object Storage and to Serverless Functions in the OSE project. It is not the key the function uses to send mail.

## One-time Scaleway setup

### Bucket

The site is served from the bucket `opensourceeurope-site` in `pl-waw`. Set both `SITE_S3_BUCKET` and `CHAT_S3_BUCKET` to `opensourceeurope-site`. The chat function builds its allowed origins from the website URL of `CHAT_S3_BUCKET`.

1. Create the bucket in `pl-waw`.
2. Turn on website hosting. Set the index document to `index.html` and the error document to `404.html`.
3. Add a bucket policy with two statements:
   - full access (`"Action": "*"`) for the deploy application `opensourceeurope-github-deploy` (`application_id:<id>`) and for the maintainer's user (`user_id:<id>`);
   - public read (`s3:GetObject`) on all objects for `"Principal": "*"`.

   On Scaleway, a bucket policy replaces the default access. A principal the policy does not list loses access, so the deploy application must be in it, or the site deploy fails with "Access Denied".

### Edge Services

The site uses the Edge Services pipeline `ose-knowledge-edge-for-https`. There is one pipeline, so no new one is needed. Its backend already points to the website endpoint of `opensourceeurope-site`.

1. Set the pipeline's DNS stage to `www.opensourceeurope.org`, with a managed TLS certificate.
2. After each deploy, purge the pipeline cache from the console, or with `scw edge-services purge-request create`. Pages carry `max-age=300`, but Edge Services keeps its own copy until it is purged.

### Function

1. Create a function namespace in `pl-waw`, then a function in it with these settings:
   - runtime `node22`
   - handler `handler.handle`
   - max-scale `2`
   - privacy public
2. Copy the function ID into `SCW_FUNCTION_ID` and its URL into `CONTACT_ENDPOINT`.
3. Set these environment variables on the function, in the console or with the command below:

   | Name | Value |
   |---|---|
   | `ALLOWED_ORIGINS` | The site origin, for example `https://www.opensourceeurope.org`. Comma-separated for more than one |
   | `SITE_URL` | The site URL. The function uses it to accept no-JavaScript posts by their `Referer` |
   | `SMTP_HOST` | `smtp.protonmail.ch`. This is the default, so you can leave it out |
   | `SMTP_PORT` | `587`. This is the default, so you can leave it out |
   | `SMTP_USER` | `home@opensourceeurope.org`, the Proton address the token belongs to |
   | `SMTP_TOKEN` | Secret environment variable. The Proton SMTP token for `SMTP_USER` (see "Proton SMTP token" below) |
   | `MAIL_FROM` | Leave it empty, or set it to the same address as `SMTP_USER`. A Proton token sends as its own address only. If the two differ, the function logs `contact: config error` and answers 502 |
   | `MAIL_TO` | The inbox that receives contact messages |

   Scaleway reserves names that start with `SCW_` for functions, so none of these names use that prefix.

The first deploy of the code is then a run of `deploy-function.yml`. The function does not exist until you create it, because the workflow only updates a function that is already there.

### Proton SMTP token

The domain's mail is on Proton, and its SPF record (`v=spf1 include:_spf.protonmail.ch -all`) allows no other sender. So the function sends through Proton's SMTP server, as `home@opensourceeurope.org`. No DNS change is needed. SMTP tokens come with the paid Proton plan.

1. In Proton Mail, open **Settings**, **All settings**, **IMAP/SMTP**, then **SMTP tokens**, and choose **Generate token**.
2. Name it `website contact form` and select `home@opensourceeurope.org` as the address. Proton shows the token once.
3. Set it straight away as the secret environment variable `SMTP_TOKEN` on the function. Do not paste it into chat, an issue or a commit.

This command sets all the variables at once. `read -rs` keeps the token out of your shell history. Replace `<function-id>` with the value of `SCW_FUNCTION_ID`:

```bash
read -rs SMTP_TOKEN
scw function function update <function-id> region=pl-waw \
  environment-variables.ALLOWED_ORIGINS=https://www.opensourceeurope.org,https://opensourceeurope.org \
  environment-variables.SITE_URL=https://www.opensourceeurope.org \
  environment-variables.SMTP_HOST=smtp.protonmail.ch \
  environment-variables.SMTP_PORT=587 \
  environment-variables.SMTP_USER=home@opensourceeurope.org \
  environment-variables.MAIL_TO=home@opensourceeurope.org \
  secret-environment-variables.0.key=SMTP_TOKEN \
  secret-environment-variables.0.value="$SMTP_TOKEN" \
  timeout=60s
unset SMTP_TOKEN
```

`timeout=60s` caps each request. The function itself gives up on a send after 30 seconds and answers 502, and its SMTP connection and socket time out sooner. The update redeploys the function. It replaces the plain environment variables with the ones in the command, so list them all. If an older setup left a `TEM_TOKEN` secret on the function, delete it in the console.

To rotate the token, generate a new one in Proton, set it on the function, then delete the old token in Proton:

```bash
read -rs SMTP_TOKEN
scw function function update <function-id> region=pl-waw secret-environment-variables.0.key=SMTP_TOKEN secret-environment-variables.0.value="$SMTP_TOKEN"
unset SMTP_TOKEN
```

Scaleway blocks outbound port 25 from functions, but it should allow port 587. "First release" has a check for this.

If port 587 turns out to be blocked, Scaleway Transactional Email is the fallback. It needs a TEM subscription, its SPF `include` and DKIM record next to Proton's, and a code change back to the TEM API.

## How the function deploy treats environment variables

The workflow runs `scw function deploy`. It looks up the namespace ID and name from the function, then uploads the zip and updates the function with `runtime=node22` and a redeploy. It sends no environment variables, secret environment variables or handler.

This was checked against the source of scaleway-cli v2.65.2, the version the workflow pins. The deploy step there sends an update request that sets only the runtime and the redeploy flag. The arguments and flags the workflow uses were also checked with `scw ... --help` on v2.55.0 and match: namespace ID, name, runtime, zip file and region. v2.55.0 is older than the pinned v2.65.2, so check them again with v2.65.2 before the first deploy. An update request leaves fields it does not set as they are, so the variables set in the console stay in place across deploys.

This differs from the MCP container deploy in `release.yml`, which sets the container image on each release. The chat function deploy is `deploy-chat-function.yml` in this repository. For both functions the console is the source of truth for the function's variables. Changing one means editing it in the console. The next deploy keeps it.

## What the site deploy does

1. Builds with `PUBLIC_CONTACT_ENDPOINT` set from `CONTACT_ENDPOINT` and `PUBLIC_CHAT_ENDPOINT` set from `CHAT_FUNCTION_URL`.
2. Syncs `dist/_astro/` to `_astro/` with `public, max-age=31536000, immutable`. This pass has no `--delete`, so a page that is still cached elsewhere finds its assets.
3. Syncs the rest of `dist/` with `public, max-age=300` and `--delete`, leaving out `_astro/`.

Both passes use `--endpoint-url https://s3.<region>.scw.cloud`. The workflow installs AWS CLI 2.34.9 from the official zip, checks its sha256, confirms `aws --version` reports 2.34.9, and calls that binary. AWS publishes PGP signatures rather than checksums, so the hash in the workflow comes from a download of the zip. To bump the version, download the new zip, compute its sha256, and change both values together. It sets `AWS_REQUEST_CHECKSUM_CALCULATION` and `AWS_RESPONSE_CHECKSUM_VALIDATION` to `when_required`, because newer AWS CLI versions add checksum headers that other S3 providers can reject.

### Pruning old `_astro/` files

Each build writes new hashed files into `_astro/`. Old ones stay, which is deliberate. Remove them by hand from time to time, once no cached page can point to them (a few days after a deploy is plenty):

```bash
aws s3 ls s3://$SITE_S3_BUCKET/_astro/ --endpoint-url https://s3.pl-waw.scw.cloud --recursive
aws s3 rm s3://$SITE_S3_BUCKET/_astro/<file> --endpoint-url https://s3.pl-waw.scw.cloud
```

Compare the listing with the files in a fresh `dist/_astro/` and delete only files that are not in it. This removes data from the bucket and cannot be undone, so list first.

## Open checks

These need an answer before launch.

- Directory URLs: check that `/about/` resolves to `/about/index.html` through Edge Services. The bucket website endpoint does this on its own. If the pipeline does not, add a rewrite or use the website endpoint as the origin.
- Bare domain: settled. Edge Services serves only subdomains, so the site is served from `www`, and `site` in `astro.config.mjs` is `https://www.opensourceeurope.org`. A Scaleway function answers `opensourceeurope.org` with a 301 to `www`. See "DNS records for the site".
- SMTP port: confirm that the function can reach `smtp.protonmail.ch` on port 587. Scaleway blocks outbound port 25, but should allow 587. The contact form check in "First release" settles this.
- Deploy leaves console variables alone: confirm with a real run that `scw function deploy` keeps the environment variables set in the console. The conclusion so far comes from reading the CLI source.
- CLI authentication: confirm that the `scw` commands in the workflow work with only the access key, secret key and region. They may also need a project or organization ID.
- Purge command: confirm the exact `scw edge-services purge-request create` arguments, or use the console, and decide whether to add the purge to the workflow.
- Edge Services plan: settled. The site uses the one existing pipeline.

- Content types: `aws s3 sync` guesses each `Content-Type` from the file extension with Python's `mimetypes`. After the first deploy, run `aws s3api head-object` on one `.avif` and one `.woff2` file. If either comes back as `binary/octet-stream`, add `--content-type` with `--exclude`/`--include` filters for those extensions to the sync step. The sync step already skips `llms.txt`, `llms-full.txt` and the Markdown copies of the docs pages (`docs*.md`), and a third pass uploads them with `charset=utf-8`.
- Deploy gating: the site and contact function deploy jobs run only on `main` and use the GitHub environment `production`. GitHub creates the environment on the first run. Add a protection rule to it if you want a manual approval. Do not move the Scaleway secrets and variables out of the repository settings, because jobs without an environment need them (see "Keep the Scaleway values at repository level"). Require the checks listed under "Required checks" on `main`, so a red commit does not release.

## DNS records for the site

The domain `opensourceeurope.org` was registered at OVH and moved to the Scaleway registrar in November 2026, so its DNS zone is in Scaleway Domains and DNS. Scaleway hosts the DNS of a domain it registers for free. It charges for the zone of a domain registered elsewhere.

| Record | Name | Value |
|---|---|---|
| CNAME | `www` | The Edge Services pipeline endpoint |
| ALIAS | `@` | The domain of the function `root-redirect`, which answers every request with a 301 to the same path on `https://www.opensourceeurope.org` |

Edge Services cannot serve a root domain, and OVH DNS has no ALIAS record, so the root domain needs the Scaleway zone. A Scaleway function has no fixed IP, so an `A` record cannot point to it. The zone also holds the mail records for Proton (MX, SPF, three DKIM CNAMEs, DMARC and the verification TXT), the Google verification CNAME and the `apply` and `automation` records. Copy them before you change a name server.

The contact form needs no email records. It sends through Proton, which the domain's SPF record already allows.

## Known weaknesses

- There is no rate limit. The only limits are the function's max-scale of 2 and Proton's sending limits for the account. A script that posts valid forms can send mail up to those limits. Each message goes only to `MAIL_TO`, so it cannot spam anyone else, but it can fill the OSE mailbox or hit Proton's limit.
- The timing check has gaps. The function rejects a post that arrives sooner than 3 seconds after the form loaded, using the `ts` field. It skips the check when `ts` is absent, which covers every no-JavaScript post and any bot that leaves the field out. It also skips the check when `ts` is in the future.
- Visitors with a fast clock can lose their message. A visitor whose clock runs ahead of the server by more than their fill time minus 3 seconds, but less than their fill time, is silently treated as spam. Their message is dropped and the form still reports success.
- Mail needs a token. Without `SMTP_TOKEN` and without an outbox file, the function answers 502 instead of pretending to send.
- The token sends as `home@`. `SMTP_TOKEN` can send any mail as `home@opensourceeurope.org`, not only contact messages. Anyone who can read the function's secrets can use it. Keep it in the function only, and revoke it in Proton if it leaks.

## Before launch

- Legal pages: OSE legal should review the privacy policy and the terms. The section "Visiting the website" names the country of the request as a logged field, because the Edge Services log holds it.
- Page-view counts: Edge Services writes a log entry for each request to Scaleway Cockpit in `fr-par`. No setting turns the logs on. Cockpit deletes them after seven days. The analytics job counts page views per page and per day from these logs, and writes only the totals to the private bucket. Run the steps in "Set up the page-view counts" in [`analytics/README.md`](../analytics/README.md). After the first run, check that the `pageviews-` files reach the bucket and that they count the hosts the site is served from.
- Chat model: check that `MISTRAL_BASE_URL` is `https://api.scaleway.ai`. With it unset, questions go to Mistral's own API, and the privacy policy says they stay on Scaleway in the EU. The "AI model" card on the `/ask/` page (`src/content/pages/ask.yaml`) names the model, so change it in the same pull request as `MISTRAL_MODEL`.
- Chat logs: the privacy policy says that the chat logs to Scaleway Cockpit when the visitor has accepted analytics in the consent banner. It logs the time, the number of calls to the AI model, whether the documentation answered the question and a version label of the instructions for each answer. When the visitor closes the Ask AI panel or leaves the page, it also logs a summary of what was asked and answered, without personal data. The policy says that Cockpit keeps them for seven days, and that the export job copies them to a private bucket in the EU, where OSE deletes them 12 months after they were logged. The job deletes each chat analytics file 356 days after the date in its name, so no record stays longer than 365 days (see "Expired chat files" in [`analytics/README.md`](../analytics/README.md)). The IAM application `ose-analytics-export` needs the `ObjectStorageObjectsDelete` permission set for that. The bucket `opensourceeurope-analytics` also has the lifecycle rule `expire-chat-analytics-12-months`, which expires objects 365 days after they were written. Check that both are still there. The same export job serves both texts. Check that the job runs and that the bucket is private.
