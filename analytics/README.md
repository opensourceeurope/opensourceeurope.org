# Chat analytics export

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
