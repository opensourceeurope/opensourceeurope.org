# Analytics job

The analytics job `ose-analytics-export` runs two steps: the chat analytics export, then the page-view counts. `run.sh` runs both. When one step fails, the other still runs, and the job run fails. The page-view counts are described in [Page-view counts](#page-view-counts).

Chat questions from visitors who accepted analytics in the site's consent
banner (the default is no sharing) are logged by the chat function as `ANALYTICS {...}` lines and land in
**Scaleway Cockpit** (EU, region `pl-waw`). Cockpit keeps logs for **7 days** by
default, so this job archives them to a **private bucket** before they expire.

## What runs where (data residency)

```
Scaleway Cron (every 3 days, EU)
        │ triggers
        ▼
Scaleway Serverless Job  ─── runs inside Scaleway EU, never touches US infra ───┐
   1. query Cockpit Loki: last 6 days, lines matching  |= "ANALYTICS"           │
   2. normalise → {timestamp, q, rounds, unanswered, prompt}, dedupe dups      │
   3. write  analytics-YYYY-MM-DD.jsonl  +  analytics-YYYY-MM-DD.csv            │
   4. upload both to the private bucket                                         │
   5. count page views in the fr-par Cockpit, upload pageviews-YYYY-MM-DD.*     │
        └────────────────────────────────────────────────────────────────────┘
```

The container **image** is built in GitHub Actions (US runners) — but it carries
no data, only the script. The **log fetch** happens at runtime on Scaleway in the
EU, so user questions never transit US compute. That is the whole reason
this is a Scaleway job and not a GitHub Actions cron.

**Cadence vs retention:** runs every 3 days but queries the last **6 days** (2×),
so the windows overlap. That overlap means a single missed/failed run self-heals
on the next run (the data is still within Cockpit's 7-day window), and it works on
the free default retention — no retention bump, no extra cost. Overlap produces
duplicate records across consecutive files; `sort -u` removes exact dups within a
file, and see "Combine + dedupe" below for across files.

## Files produced

- `analytics-YYYY-MM-DD.jsonl` — source of truth, one record per line:
  `{"timestamp":"2026-06-26T08:08:20Z","q":"how do I claim an eSIM?","rounds":3,"unanswered":false,"prompt":"1a2b3c4d"}`
- `analytics-YYYY-MM-DD.csv` — same data, columns `timestamp,rounds,question,unanswered,prompt`,
  for eyeballing in a spreadsheet.

`unanswered` is `true` when the documentation did not answer the question (the
model ended its answer with the `[[unanswered]]` marker, which the function
strips). A question asked while the documentation search was down is logged
with `unanswered: false`, because the docs were never consulted, so outages
don't show up as doc gaps. `prompt` is a version label for the chat's instructions: the first 8
hex characters of the SHA-256 of the full system prompt (the persona plus the
chat rules). It changes whenever the prompt changes, so answer quality can be
compared before and after a prompt edit. Some fields, such as `unanswered` and
`prompt`, were added to the log line later. Lines exported from logs written
before a field was added have `null` for that field in the JSONL and an empty
cell in the CSV.

`rounds` is the number of calls to the AI model for the answer, including the
final one. With the automatic first search (`CHAT_SEARCH_FIRST`, on by default)
it is at least 2: one call that leads to a search, and the answer.

`q` is the user's question (first 500 chars). No IP, no identity — anonymous, as
promised in the UI. (A user could still type personal data *into* a question; the
data is not scrubbed.)

## Page-view counts

`pageviews.sh` counts page views per page and per day from the Edge Services request logs, and writes only these totals to the bucket. The privacy policy describes this step in the section "Visiting the website".

Edge Services writes one log entry per request to Cockpit in `fr-par`, whatever the region of the job. No setting turns the logs on or off. An entry holds these fields:

- The client IP and the country of the request
- The full URL and the HTTP method
- The time
- The status codes to the client and from the origin
- The content type
- The TLS version
- The WAF mode, action and rule

The entry holds no referrer and no user agent, so the job cannot count views per referring website.

Loki does the counting. The query extracts only the fields it filters and groups by, and the client IP is not one of them. Loki returns one total per host and path, so the client IP never leaves Cockpit. A page view is a `GET` request answered with `200` and an HTML page. The job keeps the hosts in `SITE_HOSTS` and drops `/.well-known/` paths. The path in a total has no query string. Requests from bots count too, because the log has no user agent to tell them apart.

Each run counts the last six complete UTC days, with one Loki query per day. Runs are three days apart, so each day is in two files, and one failed run loses no day. A day has the same totals in every file that holds it.

The job writes these files:

- `pageviews-YYYY-MM-DD.jsonl`, one total per line: `{"date":"2026-11-04","host":"opensourceeurope.org","path":"/about/","views":21}`
- `pageviews-YYYY-MM-DD.csv`, the same data with the columns `date,host,path,views`

The following command merges all files into one total per day and page:

```bash
cat analytics-data/pageviews-*.jsonl | jq -s 'unique_by(.date, .host, .path)' > all-pageviews.json
```

The bucket lifecycle rule `expire-chat-analytics-12-months` has an empty prefix, so it also deletes the page-view files 365 days after the job wrote them. To keep the totals longer, give the rule the prefix `analytics-`.

Without `EDGE_LOKI_URL`, the step prints that it skipped the counts and the job run succeeds.

## Job configuration

The job definition `ose-analytics-export` runs `run.sh` at 500 mCPU in `pl-waw`. It gets these environment variables:

| Variable | Source | Value |
|---|---|---|
| `LOKI_URL` | Plain variable | Loki URL of the project's Cockpit logs data source |
| `ANALYTICS_BUCKET` | Plain variable | `opensourceeurope-analytics` |
| `SCW_REGION` | Plain variable | `pl-waw` |
| `SCW_ACCESS_KEY` | Plain variable | Access key ID of the IAM application `ose-analytics-export` |
| `SCW_SECRET_KEY` | Secret Manager, secret `ose-analytics-export-scw-secret-key`, version `latest` | Secret key of that access key |
| `COCKPIT_TOKEN` | Secret Manager, secret `ose-analytics-export-cockpit-token`, version `latest` | Secret key of a Cockpit token with only the `read_only_logs` scope |
| `EDGE_LOKI_URL` | Plain variable | Loki URL of the `fr-par` Cockpit logs data source, which holds the Edge Services logs |
| `EDGE_COCKPIT_TOKEN` | Secret Manager, secret `ose-analytics-export-edge-cockpit-token`, version `latest` | Secret key of a `fr-par` Cockpit token with only the `read_only_logs` scope |
| `SITE_HOSTS` | Plain variable, optional | Host names to count, separated by spaces. Default `opensourceeurope.org www.opensourceeurope.org` |

A Cockpit token reads only the data sources of the region it was created in. A `pl-waw` token gets `403` from the `fr-par` Loki URL. The chat logs are in `pl-waw` and the Edge Services logs are in `fr-par`, so the job needs two tokens. Without `EDGE_COCKPIT_TOKEN`, `pageviews.sh` uses `COCKPIT_TOKEN`. That works only when the job and the chat function move to `fr-par`.

The IAM application `ose-analytics-export` has one policy, with the `ObjectStorageObjectsWrite` permission set in the project. The job never gets the CI deploy key. The values of the two secrets stay in Secret Manager and never enter GitHub.

`deploy-analytics-job.yml` creates the job definition on its first run, with the plain variables and the two secret references. Later runs change only the image and the CPU limit. To rotate a secret, add a new version to it in Secret Manager. The next run reads the new version.

## Set up the job

Run these steps once, before the first run of `deploy-analytics-job.yml`. Use the Scaleway CLI with a profile that can manage IAM, Cockpit and Secret Manager. Replace `{PROJECT_ID}` with the ID of the project.

1. Create a private bucket in `pl-waw`, for example `opensourceeurope-analytics`.
2. Create the IAM application and its policy. Replace `{APP_ID}` with the ID that the first command prints.

   ```bash
   scw iam application create name=ose-analytics-export description="Analytics export job"
   scw iam policy create name=ose-analytics-export-s3-write application-id={APP_ID} rules.0.permission-set-names.0=ObjectStorageObjectsWrite rules.0.project-ids.0={PROJECT_ID}
   ```

3. Create an API key for the application, and store its secret key in Secret Manager. The commands write the secret key to a file that only you can read, and delete the file at the end. Replace `{SECRET_ID}` with the ID that `scw secret secret create` prints.

   ```bash
   umask 077
   scw iam api-key create application-id={APP_ID} default-project-id={PROJECT_ID} description="ose-analytics-export job" -o json > api-key.json
   jq -r .access_key api-key.json
   jq -j .secret_key api-key.json > scw-secret-key.txt
   scw secret secret create region=pl-waw project-id={PROJECT_ID} name=ose-analytics-export-scw-secret-key
   scw secret version create {SECRET_ID} region=pl-waw data=@scw-secret-key.txt
   rm api-key.json scw-secret-key.txt
   ```

   The `jq -r .access_key` command prints the access key ID. Keep it for step 5. Use `jq -j`, not `jq -r`, for the secret key, because `jq -r` adds a newline that becomes part of the secret.

4. Create the Cockpit token, and store its secret key in Secret Manager. Replace `{SECRET_ID}` with the ID that `scw secret secret create` prints.

   ```bash
   umask 077
   scw cockpit token create region=pl-waw project-id={PROJECT_ID} name=ose-analytics-export token-scopes.0=read_only_logs -o json | jq -j .secret_key > cockpit-token.txt
   scw secret secret create region=pl-waw project-id={PROJECT_ID} name=ose-analytics-export-cockpit-token
   scw secret version create {SECRET_ID} region=pl-waw data=@cockpit-token.txt
   rm cockpit-token.txt
   ```

5. Set these repository variables under Settings, Secrets and variables, Actions:
   - `ANALYTICS_BUCKET`: the bucket name from step 1.
   - `OSE_ANALYTICS_LOKI_URL`: the Loki URL of the project's Cockpit logs data source.
   - `ANALYTICS_EXPORT_ACCESS_KEY`: the access key ID from step 3.
6. Run `deploy-analytics-job.yml`. The workflow finds the two secrets by name in the project and attaches them to the new job definition. The CI deploy key must be allowed to list secrets in Secret Manager. When a secret is missing, the workflow stops and names it.
7. Start a run of the job in the Scaleway console and check that the two files reach the bucket.

A job definition that exists without the secret references does not get them from the workflow, because later runs change only the image. The following command attaches them by hand. Replace `{JOB_ID}` with the ID of the job definition, and the two secret IDs with the IDs from `scw secret secret list region=pl-waw name=ose-analytics-export`.

```bash
scw jobs secret create job-definition-id={JOB_ID} region=pl-waw secrets.0.secret-manager-id={SCW_SECRET_KEY_SECRET_ID} secrets.0.secret-manager-version=latest secrets.0.env-var-name=SCW_SECRET_KEY secrets.1.secret-manager-id={COCKPIT_TOKEN_SECRET_ID} secrets.1.secret-manager-version=latest secrets.1.env-var-name=COCKPIT_TOKEN
```

## Set up the page-view counts

Run these steps once. They add the page-view counts to a job definition that already exists. Replace `{PROJECT_ID}` with the ID of the project.

1. Print the Loki URL of the `fr-par` logs data source:

   ```bash
   scw cockpit data-source list region=fr-par origin=scaleway type=logs -o json | jq -r '.[0].url'
   ```

2. Create a `fr-par` Cockpit token, and store its secret key in Secret Manager in `pl-waw`. Replace `{SECRET_ID}` with the ID that `scw secret secret create` prints.

   ```bash
   umask 077
   scw cockpit token create region=fr-par project-id={PROJECT_ID} name=ose-analytics-export-edge token-scopes.0=read_only_logs -o json | jq -j .secret_key > edge-cockpit-token.txt
   scw secret secret create region=pl-waw project-id={PROJECT_ID} name=ose-analytics-export-edge-cockpit-token
   scw secret version create {SECRET_ID} region=pl-waw data=@edge-cockpit-token.txt
   rm edge-cockpit-token.txt
   ```

3. Set the repository variable `OSE_EDGE_LOKI_URL` to the URL from step 1. `deploy-analytics-job.yml` uses it only when it creates a new job definition.
4. Print the environment variables of the job definition. Replace `{JOB_ID}` with the ID of the job definition.

   ```bash
   scw jobs definition get {JOB_ID} region=pl-waw -o json | jq .environment_variables
   ```

5. Set the environment variables again, with `EDGE_LOKI_URL` added. An update that sets environment variables replaces the whole set, so pass every variable from step 4.

   ```bash
   scw jobs definition update {JOB_ID} region=pl-waw environment-variables.LOKI_URL={LOKI_URL} environment-variables.ANALYTICS_BUCKET={ANALYTICS_BUCKET} environment-variables.SCW_REGION=pl-waw environment-variables.SCW_ACCESS_KEY={SCW_ACCESS_KEY} environment-variables.EDGE_LOKI_URL={EDGE_LOKI_URL}
   ```

6. Attach the secret to the job definition. Replace `{EDGE_SECRET_ID}` with the ID from step 2.

   ```bash
   scw jobs secret create job-definition-id={JOB_ID} region=pl-waw secrets.0.secret-manager-id={EDGE_SECRET_ID} secrets.0.secret-manager-version=latest secrets.0.env-var-name=EDGE_COCKPIT_TOKEN
   ```

7. Start a run of the job in the Scaleway console. Check that the log of the run shows `Collected` with a number of page views, and that the two `pageviews-` files reach the bucket.

The next run of the job writes the page-view files with the chat analytics files.

---

## Quick start: fetch the data locally

The bucket is plain S3-compatible storage, so the `aws` CLI works as a generic S3
client pointed at Scaleway — **no Amazon account involved**. Any S3 tool works
(`rclone`, `s5cmd`, …); `aws` shown here.

```bash
# 1. Credentials = your Scaleway API key (the public access key + its secret).
export AWS_ACCESS_KEY_ID=SCWXXXXXXXXXXXXXXXXX
export AWS_SECRET_ACCESS_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export AWS_DEFAULT_REGION=pl-waw
EP=https://s3.pl-waw.scw.cloud          # Scaleway Object Storage endpoint
B=s3://opensourceeurope-analytics          # the private analytics bucket

# 2. List what's there
aws s3 ls "$B/" --endpoint-url "$EP"

# 3. Download the latest CSV (open it in a spreadsheet)
aws s3 cp "$B/analytics-2026-06-26.csv" . --endpoint-url "$EP"

# 4. Peek at a JSONL file WITHOUT saving it
aws s3 cp "$B/analytics-2026-06-26.jsonl" - --endpoint-url "$EP" | jq .

# 5. Sync everything locally (incremental — only new files)
aws s3 sync "$B/" ./analytics-data/ --endpoint-url "$EP"
```

### Combine + dedupe across files

Because the query windows overlap, the same question can appear in two daily
files. Merge and de-duplicate by `(timestamp, q)`:

```bash
cat analytics-data/*.jsonl | jq -s 'unique_by(.timestamp, .q)' > all-analytics.json

# Most common questions (quick signal for doc gaps)
jq -r '.q' all-analytics.json | sort | uniq -c | sort -rn | head -20

# Share of unanswered questions per prompt version
jq -r 'group_by(.prompt)[] | "\(.[0].prompt // "none") \(map(select(.unanswered == true)) | length)/\(length)"' all-analytics.json

# Questions the docs could not answer (the clearest doc gaps)
jq -r 'select(.unanswered == true) | .q' all-analytics.json | sort | uniq -c | sort -rn

# Questions where the agent needed the most model calls (hardest to answer)
jq -r 'select(.rounds >= 4) | .q' all-analytics.json | sort -u
```

> **Note:** downloading to your machine pulls the data out of EU infrastructure to
> wherever you are. That's a maintainer choice for analysis and fine; just be aware
> it leaves the EU-only path the job itself maintains.
